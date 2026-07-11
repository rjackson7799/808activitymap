-- Migration 2: app_config — every PRD §22 value is a row here, never a code
-- constant. The typed contract (per-key schema, fail-closed rule) lives in
-- /config/app-config.ts; production has NO code defaults for these keys.

create table public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
revoke all on table public.app_config from anon;

create trigger app_config_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

-- Audit trigger attached in migration 4 (write_audit is defined there).
