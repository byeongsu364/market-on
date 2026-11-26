-- Live projections only: no operational data or private identities are copied.
alter table public.documents add column review_status text not null default 'draft'
 check (review_status in ('draft','reviewed','rejected'));
alter table public.chunks add column variety_id text references public.entities(id) on delete set null;
alter table public.chunks add column numbers text[] not null default '{}';

create view public.onto_node(id, type, name, props, source_key) as
select e.id, e.type, e.name_ko, jsonb_build_object('attrs',e.attrs,'kamis',e.kamis), s.source_key
from public.entities e left join public.sources s on s.id=e.source_id
union all
select s.source_key, 'source', s.title,
 jsonb_build_object('publisher',s.publisher,'url',s.url,'license',s.license,'quote_only',s.quote_only), s.source_key from public.sources s
union all
select 'doc:'||d.doc_key, 'document', d.title,
 jsonb_build_object('doc_type',d.doc_type,'lang',d.lang,'published',d.published,'review_status',d.review_status), s.source_key
from public.documents d join public.sources s on s.id=d.source_id
union all
select m.id,'market',m.name_ko,jsonb_build_object('address',m.address,'status',m.status),null from public.markets m
union all
select z.id,'zone',z.name_ko,jsonb_build_object('market_id',z.market_id),null from public.zones z
union all
select s.id,'store',s.name_ko,jsonb_build_object('market_id',s.market_id,'zone_id',s.zone_id,'active',s.active),null from public.stores s
union all
select 'sale:'||c.id,'sale','마감 할인',jsonb_build_object('sale_price',c.sale_price,'regular_price',c.regular_price,'unit_id',c.unit_id,'starts_at',c.starts_at,'ends_at',c.ends_at,'status',c.status,'variety_id',c.variety_id),null from public.closing_sales c
union all
select 'price:'||p.id,'price',p.item_nm,jsonb_build_object('date',p.exmn_ymd,'region',p.sgg_nm,'market',p.mrkt_nm,'distribution',p.se_cd,'market_type',p.market_type,'price',p.price,'unit',p.unit,'unit_sz',p.unit_sz,'origin','aT'),null from public.price_observations p
union all
select 'report:'||p.id,'report','가격 제보',jsonb_build_object('price',p.price,'unit_id',p.unit_id,'quantity',p.quantity,'date',p.reported_at),null from public.price_reports p
union all
select 'request:'||market_id,'market_request','시장 요청',jsonb_build_object('request_count',count(*),'latest_request_date',max(day)),null
from public.market_demand where kind='request' group by market_id;

create view public.onto_edge(subj,pred,obj,obj_value,props,source_key) as
select r.subject_id,r.predicate,r.object_id,r.object_value,r.props,s.source_key
from public.entity_relations r left join public.sources s on s.id=r.source_id
union all
select store_id,'sells',item_id,null,jsonb_build_object('source',source),null from public.store_items
union all
select market_id,'contains',id,null,'{}'::jsonb,null from public.zones
union all
select coalesce(zone_id,market_id),'contains',id,null,'{}'::jsonb,null from public.stores
union all
select store_id,'posts','sale:'||id,null,'{}'::jsonb,null from public.closing_sales
union all
select 'sale:'||id,'about',item_id,null,'{}'::jsonb,null from public.closing_sales
union all
select item_id,'hasPrice','price:'||id,null,'{}'::jsonb,null from public.price_observations where item_id is not null
union all
select variety_id,'hasPrice','price:'||id,null,'{}'::jsonb,null from public.price_observations where variety_id is not null
union all
select 'report:'||id,'reportedAt',coalesce(store_id,market_id),null,'{}'::jsonb,null from public.price_reports
union all
select 'report:'||id,'about',item_id,null,'{}'::jsonb,null from public.price_reports
union all
select store_id,'confirmedBy','merchant',null,jsonb_build_object('item_id',item_id,'price',price,'unit_id',unit_id,'date',confirmed_at),null from public.store_price_confirmations
union all
select distinct 'request:'||market_id,'requests',market_id,null::jsonb,'{}'::jsonb,null::text from public.market_demand where kind='request'
union all
select e.id,'supportedBy',s.source_key,null,'{}'::jsonb,s.source_key from public.entities e join public.sources s on s.id=e.source_id
union all
-- Relation provenance retains one row per original relation, including literal edges.
select r.subject_id,'supportedBy',s.source_key,null,jsonb_build_object('relation_id',r.id,'predicate',r.predicate,'object_id',r.object_id),s.source_key
from public.entity_relations r join public.sources s on s.id=r.source_id
union all
select 'doc:'||d.doc_key,'supportedBy',s.source_key,null,'{}'::jsonb,s.source_key from public.documents d join public.sources s on s.id=d.source_id
union all
select distinct 'doc:'||d.doc_key,'describes',e.id,null::jsonb,'{}'::jsonb,null::text
from public.documents d join public.chunks c on c.document_id=d.id join public.chunk_entities ce on ce.chunk_id=c.id join public.entities e on e.id=ce.entity_id where e.type='item';

create view public.rag_chunk as
select c.id as chunk_id,c.document_id,
 array(select ce.entity_id from public.chunk_entities ce join public.entities e on e.id=ce.entity_id where ce.chunk_id=c.id and e.type='item' order by ce.entity_id) as item_ids,
 c.doc_type as node_type,
 case c.doc_type
 when 'criterion' then 'select' when 'grade' then 'select' when 'merchant_tip' then 'select'
 when 'storage' then 'store' when 'prep' then 'prep' when 'story' then 'story'
 when 'origin' then 'origin' when 'specialty' then 'origin' when 'safety' then 'safety'
 when 'context' then 'context' when 'guide' then 'guide' when 'recipe' then 'recipe'
 end as intent,
 c.variety_id,c.numbers,d.review_status,s.source_key,s.license,s.quote_only,c.content_hash as chunk_hash,c.lang
from public.chunks c join public.documents d on d.id=c.document_id join public.sources s on s.id=d.source_id;

create or replace function public.match_chunks(
    query_embedding vector(1024),
    entity_ids text[] default null,
    doc_types text[] default null,
    lang text default null,
    match_count int default 5,
    min_similarity float default 0.0
)
returns table (
    chunk_id bigint,
    content text,
    similarity float,
    doc_type text,
    document_title text,
    store_id text,
    source_title text,
    source_url text,
    license text
)
language sql stable
set search_path = public
set hnsw.iterative_scan = 'strict_order'
as $$
    select c.id, c.content, 1 - (c.embedding <=> query_embedding),
           c.doc_type, d.title, d.store_id, s.title, s.url, s.license
    from public.chunks c
    join public.documents d on d.id = c.document_id
    join public.sources s on s.id = d.source_id
    where d.review_status <> 'rejected' and c.embedding is not null
      and (entity_ids is null or cardinality(entity_ids) = 0 or exists (
          select 1 from public.chunk_entities ce
          where ce.chunk_id = c.id and ce.entity_id = any(entity_ids)
      ))
      and (doc_types is null or c.doc_type = any(doc_types))
      and (match_chunks.lang is null or c.lang = match_chunks.lang)
      and 1 - (c.embedding <=> query_embedding) >= min_similarity
    order by c.embedding <=> query_embedding
    limit match_count;
$$;
