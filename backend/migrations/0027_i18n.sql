alter table public.entity_labels drop constraint entity_labels_kind_check;
alter table public.entity_labels add constraint entity_labels_kind_check
    check (kind in ('preferred', 'synonym', 'colloquial', 'vision', 'translated'));
alter table public.users add column lang text not null default 'ko'
    check (lang in ('ko', 'en', 'zh', 'ja', 'vi'));
