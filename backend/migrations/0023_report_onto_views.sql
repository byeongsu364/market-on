create or replace view public.onto_node(id, type, name, props, source_key) as
with normalized as (
 select p.*, t.object_id as target_unit,
 p.price::numeric/coalesce(p.quantity,1)*case
 when p.unit_id=t.object_id then 1
 when coalesce((u.props->>'factor_kg')::numeric,case p.unit_id when 'unit:kg' then 1 when 'unit:g' then 0.001 end)>0
 and coalesce((t.props->>'factor_kg')::numeric,case t.object_id when 'unit:kg' then 1 when 'unit:g' then 0.001 end)>0
 then coalesce((t.props->>'factor_kg')::numeric,case t.object_id when 'unit:kg' then 1 when 'unit:g' then 0.001 end)/coalesce((u.props->>'factor_kg')::numeric,case p.unit_id when 'unit:kg' then 1 when 'unit:g' then 0.001 end)
 when (u.props->>'count')::numeric>0 and (t.props->>'count')::numeric>0 then (t.props->>'count')::numeric/(u.props->>'count')::numeric end as value
 from public.price_reports p
 join public.entity_relations t on t.subject_id=p.item_id and t.predicate='soldBy' and t.props->>'default'='true'
 left join public.entity_relations u on u.subject_id=p.item_id and u.predicate='soldBy' and u.object_id=p.unit_id
 where p.status='ok' and p.store_id is not null and p.device_hash is not null
 and p.reported_at >= current_timestamp-interval '7 days'
), latest as (
 select distinct on (store_id,item_id,device_hash) * from normalized where value is not null
 order by store_id,item_id,device_hash,reported_at desc,id desc
), centers as (
 select store_id,item_id,percentile_cont(0.5) within group(order by value) as middle
 from latest group by store_id,item_id having count(*)>=3
), customer_prices as (
 select l.store_id,l.item_id,l.target_unit,
 round((percentile_cont(0.5) within group(order by l.value))::numeric)::int as price,
 count(*) as reporters,max(l.reported_at) as latest_at
 from latest l join centers c using(store_id,item_id)
 where abs(l.value-c.middle)<=c.middle*0.30
 group by l.store_id,l.item_id,l.target_unit
)
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
select 'report:'||p.id,'report','가격 제보',jsonb_build_object('price',p.price,'unit_id',p.unit_id,'quantity',p.quantity,'date',p.reported_at,'status',p.status),null from public.price_reports p
union all
select 'request:'||market_id,'market_request','시장 요청',jsonb_build_object('request_count',count(*),'latest_request_date',max(day)),null
from public.market_demand where kind='request' group by market_id
union all
select 'price:report:'||p.store_id||':'||p.item_id,'price','손님 제보',
 jsonb_build_object('origin','제보','store_id',p.store_id,'item_id',p.item_id,
 'price',p.price,'unit_id',p.target_unit,'reporters',p.reporters,'date',p.latest_at),null
from customer_prices p;

create or replace view public.onto_edge(subj,pred,obj,obj_value,props,source_key) as
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
from public.documents d join public.chunks c on c.document_id=d.id join public.chunk_entities ce on ce.chunk_id=c.id join public.entities e on e.id=ce.entity_id where e.type='item'
union all
select p.props->>'item_id','hasPrice',p.id,null,'{}'::jsonb,null
from public.onto_node p where p.type='price' and p.props->>'origin'='제보'
union all
select p.props->>'store_id','hasPrice',p.id,null,'{}'::jsonb,null
from public.onto_node p where p.type='price' and p.props->>'origin'='제보';
