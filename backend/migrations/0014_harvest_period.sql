-- 품목·품종의 수확 시기(값: 달·순 라벨)를 온톨로지 관계로 저장 (2026-11-26, 제철을 RAG에서 온톨로지로 이동)
-- 제철 달은 기존 inSeason(→ season 엔터티)을 그대로 사용
alter table public.entity_relations drop constraint entity_relations_predicate_check;
alter table public.entity_relations add constraint entity_relations_predicate_check check (predicate in ('isA', 'hasGrade', 'hasCriterion', 'soldBy', 'inSeason', 'storedAs', 'hasPrep', 'suitableFor', 'substituteFor', 'pairsWith', 'producedIn', 'specialtyOf', 'suitsWeather', 'usedIn', 'hasOriginTip', 'hasSafetyNote', 'harvestPeriod'));
