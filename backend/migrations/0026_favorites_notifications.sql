create table favorites (
 user_id uuid references users(id) on delete cascade,
 store_id text references stores(id) on delete cascade,
 notify boolean not null default true, created_at timestamptz not null default now(),
 primary key(user_id,store_id)
);
create index favorites_store_idx on favorites(store_id);
create table notification_settings (
 user_id uuid primary key references users(id) on delete cascade,
 sales boolean not null default true, season boolean not null default true
);
create table notifications (
 id bigserial primary key, user_id uuid not null references users(id) on delete cascade,
 kind text not null check(kind in ('sale','season')), title text not null, body text not null,
 url text not null check(url ~ '^/([^/]|$)' and url !~ '[\\]'),
 created_at timestamptz not null default now(), read_at timestamptz
);
create index notifications_user_idx on notifications(user_id,created_at desc);
-- Separate delivery ledger survives the 90-day inbox cleanup.
create table notification_events (
 user_id uuid references users(id) on delete cascade, event_key text not null,
 primary key(user_id,event_key)
);
create table push_subscriptions (
 id bigserial primary key, user_id uuid not null references users(id) on delete cascade,
 endpoint text not null unique, p256dh text not null, auth text not null,
 created_at timestamptz not null default now(), last_ok_at timestamptz
);
