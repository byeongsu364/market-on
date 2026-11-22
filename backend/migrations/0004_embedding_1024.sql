-- Ollama bge-m3 임베딩으로 전환: 기존 벡터와 응답 캐시는 재사용할 수 없어요.
update public.chunks set embedding = null;
drop index public.chunks_embedding_idx;
alter table public.chunks alter column embedding type vector(1024);
create index chunks_embedding_idx on public.chunks using hnsw (embedding vector_cosine_ops);

drop function public.match_chunks(vector, text[], text[], text, int, float);

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
    where c.embedding is not null
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

truncate table public.response_cache;
