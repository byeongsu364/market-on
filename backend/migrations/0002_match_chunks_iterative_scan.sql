-- match_chunks: 엔터티·유형 필터를 걸어도 HNSW가 결과를 빠뜨리지 않게 반복 스캔을 켜요 (pgvector 0.8+).
-- 문제: HNSW는 가까운 후보 약 40개(ef_search)를 먼저 뽑고 나서 필터를 적용해요.
--       조각 2,000개 중 대파 10개를 찾을 때 1개만 나왔어요 (2026-11-22 로컬 검증).
-- 해결: hnsw.iterative_scan = strict_order 로 필터를 통과한 결과가 match_count개 찰 때까지 계속 스캔해요.
-- 적용: cd backend && python -m scripts.migrate

alter function public.match_chunks(vector, text[], text[], text, int, float)
    set hnsw.iterative_scan = 'strict_order';
