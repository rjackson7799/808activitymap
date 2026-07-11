-- Migration 6: locations (venue: address, geo, phone, operational status).
-- Address is structured jsonb — per-locale *formatting* happens at render;
-- the address itself is a base fact, never locale content (fallback matrix).

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  address jsonb,
  geo_lat numeric(9, 6),
  geo_lng numeric(10, 6),
  phone text,
  operational_status text not null default 'active'
    constraint locations_operational_status_check check (
      operational_status in (
        'active', 'temporarily_closed', 'permanently_closed', 'suspended', 'disputed'
      )
    ),
  timezone text not null default 'Pacific/Honolulu',
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, market_id),
  foreign key (organization_id, market_id)
    references public.organizations (id, market_id) on delete restrict
);

create index locations_organization_idx on public.locations (organization_id);

alter table public.locations enable row level security;
revoke all on table public.locations from anon;

create trigger locations_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

create trigger audit_locations
  after insert or update or delete on public.locations
  for each row execute function public.write_audit();
