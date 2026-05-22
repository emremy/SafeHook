create table if not exists safehook_webhooks (
  key text primary key,
  status text not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists safehook_webhooks_status_idx
  on safehook_webhooks (status);

create index if not exists safehook_webhooks_updated_at_idx
  on safehook_webhooks (updated_at desc);
