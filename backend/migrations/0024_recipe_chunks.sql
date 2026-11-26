alter table public.chunks add column props jsonb not null default '{}'::jsonb;

create or replace view public.rag_chunk as
select c.id as chunk_id,c.document_id,
 array(select ce.entity_id from public.chunk_entities ce join public.entities e on e.id=ce.entity_id where ce.chunk_id=c.id and e.type='item' order by ce.entity_id) as item_ids,
 c.doc_type as node_type,
 case c.doc_type
 when 'criterion' then 'select' when 'grade' then 'select' when 'merchant_tip' then 'select'
 when 'storage' then 'store' when 'prep' then 'prep' when 'story' then 'story'
 when 'origin' then 'origin' when 'specialty' then 'origin' when 'safety' then 'safety'
 when 'context' then 'context' when 'guide' then 'guide' when 'recipe' then 'recipe'
 end as intent,
 c.variety_id,c.numbers,d.review_status,s.source_key,s.license,(s.quote_only or c.doc_type='recipe') as quote_only,c.content_hash as chunk_hash,c.lang,
 c.props->>'main_item_id' as main_item_id,c.props->>'dish_type' as dish_type,
 c.props->>'cook_method' as cook_method,c.props->'season_months' as season_months,
 c.props->'weather_tags' as weather_tags
from public.chunks c join public.documents d on d.id=c.document_id join public.sources s on s.id=d.source_id;

update public.sources set quote_only=true where source_key='src:foodsafety-cookrcp01';
