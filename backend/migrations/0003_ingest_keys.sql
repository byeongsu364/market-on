-- Stable identities for repeatable file ingestion. Existing tables must be empty.
alter table public.sources add column source_key text not null unique;
alter table public.documents add column doc_key text not null unique;
