-- 040: 어떤 역할(route·plan·extract·write·reason·vision)로 부른 호출인지 기록
-- 발표 때 "최종 답(write)의 몇 %를 젬마가 썼나"를 보여 주기 위함. 질문·답 내용은 여전히 저장하지 않아요
alter table llm_calls add column role text null;
create index llm_calls_role_created on llm_calls (role, created_at);
