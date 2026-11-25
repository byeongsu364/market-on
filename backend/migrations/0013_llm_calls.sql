-- Model routing metadata only; never persist prompts, images or answers.
create table llm_calls (
    id bigserial primary key,
    task text not null,
    provider text not null,
    model text not null,
    ms int not null,
    escalated bool not null,
    reason text null,
    ok bool not null,
    created_at timestamptz not null default now()
);
