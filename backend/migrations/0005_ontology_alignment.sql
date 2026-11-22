-- Align allowed values and metadata with docs/design/03-ontology-alignment.md.
alter table public.entities drop constraint entities_type_check;
alter table public.entities add constraint entities_type_check check (type in ('item', 'category', 'variety', 'unit', 'region', 'season', 'criterion', 'context', 'weather', 'recipe', 'store_category', 'origin_tip', 'safety_note'));
alter table public.entity_labels drop constraint entity_labels_kind_check;
alter table public.entity_labels add constraint entity_labels_kind_check check (kind in ('preferred', 'synonym', 'colloquial', 'vision'));
alter table public.entity_relations drop constraint entity_relations_predicate_check;
alter table public.entity_relations add constraint entity_relations_predicate_check check (predicate in ('isA', 'hasGrade', 'hasCriterion', 'soldBy', 'inSeason', 'storedAs', 'hasPrep', 'suitableFor', 'substituteFor', 'pairsWith', 'producedIn', 'specialtyOf', 'suitsWeather', 'usedIn', 'hasOriginTip', 'hasSafetyNote'));
alter table public.documents drop constraint documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (doc_type in ('criterion', 'grade', 'storage', 'prep', 'story', 'season', 'origin', 'safety', 'context', 'specialty', 'guide', 'recipe', 'merchant_tip'));
alter table public.chunks drop constraint chunks_doc_type_check;
alter table public.chunks add constraint chunks_doc_type_check check (doc_type in ('criterion', 'grade', 'storage', 'prep', 'story', 'season', 'origin', 'safety', 'context', 'specialty', 'guide', 'recipe', 'merchant_tip'));
alter table public.entity_relations add column props jsonb;
alter table public.entities add column source_id bigint references public.sources(id);
alter table public.documents add column market_id text;
alter table public.documents add column published date;
alter table public.sources add column quote_only boolean not null default false;
