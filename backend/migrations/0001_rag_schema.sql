-- 기준: docs/design/01-rag-db.md (3, 4, 7, 8장), docs/tasks/002-rag-migration.md
-- 적용: cd backend && python -m scripts.migrate

create extension if not exists vector;

create table public.entities (
    id text primary key,
    type text not null check (type in ('item', 'category', 'region', 'season', 'recipe', 'store_category', 'criterion')),
    name_ko text not null,
    kamis jsonb,
    attrs jsonb,
    updated_at timestamptz not null default now()
);

create table public.sources (
    id bigserial primary key,
    title text not null,
    publisher text,
    url text,
    license text,
    kind text not null check (kind in ('public_doc', 'public_api', 'merchant_voice', 'team_written')),
    retrieved_at date default now()
);

create table public.entity_labels (
    entity_id text references public.entities(id) on delete cascade,
    label text,
    lang text not null check (lang in ('ko', 'en', 'zh', 'ja', 'vi')),
    kind text not null default 'synonym' check (kind in ('preferred', 'synonym', 'colloquial')),
    label_norm text generated always as (regexp_replace(lower(label), '[[:space:]]+', '', 'g')) stored,
    primary key (entity_id, label, lang)
);

create table public.entity_relations (
    id bigserial primary key,
    subject_id text not null references public.entities(id) on delete cascade,
    predicate text not null check (predicate in ('isA', 'producedIn', 'hasCriterion', 'hasGrade', 'inSeason', 'usedIn', 'suitableFor', 'suitsWeather', 'soldAt')),
    object_id text references public.entities(id) on delete cascade,
    object_value jsonb,
    source_id bigint references public.sources(id),
    check ((object_id is not null) <> (object_value is not null))
);

create table public.documents (
    id bigserial primary key,
    source_id bigint not null references public.sources(id),
    doc_type text not null check (doc_type in ('criterion', 'season', 'storage', 'recipe', 'merchant_tip', 'prep')),
    title text not null,
    lang text not null check (lang in ('ko', 'en', 'zh', 'ja', 'vi')),
    body text not null,
    store_id text,
    content_hash text not null unique,
    created_at timestamptz not null default now()
);

create table public.chunks (
    id bigserial primary key,
    document_id bigint not null references public.documents(id) on delete cascade,
    chunk_index int not null,
    content text not null,
    embedding vector(768),
    doc_type text not null check (doc_type in ('criterion', 'season', 'storage', 'recipe', 'merchant_tip', 'prep')),
    lang text not null check (lang in ('ko', 'en', 'zh', 'ja', 'vi')),
    content_hash text not null unique
);

create table public.chunk_entities (
    chunk_id bigint references public.chunks(id) on delete cascade,
    entity_id text references public.entities(id) on delete cascade,
    primary key (chunk_id, entity_id)
);

create table public.response_cache (
    cache_key text primary key,
    answer jsonb not null,
    model text not null,
    created_at timestamptz not null default now()
);

create index entity_labels_label_norm_idx on public.entity_labels (label_norm);
create index chunks_embedding_idx on public.chunks using hnsw (embedding vector_cosine_ops);
create index chunks_doc_type_idx on public.chunks (doc_type);
create index chunks_lang_idx on public.chunks (lang);
create index chunk_entities_entity_id_idx on public.chunk_entities (entity_id);
create index entity_relations_subject_predicate_idx on public.entity_relations (subject_id, predicate);
create index entity_relations_object_id_idx on public.entity_relations (object_id);
create index response_cache_created_at_idx on public.response_cache (created_at);

create or replace function public.match_chunks(
    query_embedding vector(768),
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

create or replace function public.invalidate_cache_for_entity(p_entity_id text)
returns bigint
language sql volatile
set search_path = public
as $$
    with deleted as (
        delete from public.response_cache
        where left(cache_key, length(p_entity_id) + 1) = p_entity_id || ':'
        returning 1
    )
    select count(*) from deleted;
$$;
