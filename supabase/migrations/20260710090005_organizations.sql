-- Migration 5: organizations — content-domain entity only in Slice 1 (a
-- listing needs a parent); implies no account/team functionality (that is
-- Slice 3: memberships, claims, invitations).
--
-- market_id integrity pattern (used by every content table from here on):
-- unique (id, market_id) so children can carry composite FKs — cross-market
-- relationships become impossible by construction, not just defaulted away.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  notes text,
  status text not null default 'active'
    constraint organizations_status_check check (status in ('active', 'inactive')),
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, market_id)
);

alter table public.organizations enable row level security;
revoke all on table public.organizations from anon;

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger audit_organizations
  after insert or update or delete on public.organizations
  for each row execute function public.write_audit();
