-- Migration 3: markets reference table, platform user_roles, SQL auth helpers.
--
-- markets is reference data required in every environment, so the launch row
-- is inserted here (migrations run everywhere; seeds never run in prod).

create table public.markets (
  id text primary key,
  name text not null,
  timezone text not null default 'Pacific/Honolulu',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.markets enable row level security;
revoke all on table public.markets from anon;

create trigger markets_updated_at
  before update on public.markets
  for each row execute function public.set_updated_at();

insert into public.markets (id, name) values ('oahu-waikiki', 'Waikīkī, Oʻahu');

-- Platform roles only (PRD §4). Vendor-side roles live in
-- organization_memberships (Slice 3). contributor has no organization, so it
-- is granted here.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null
    constraint user_roles_role_check check (
      role in (
        'super_admin',
        'publisher',
        'editor',
        'language_reviewer_ja',
        'language_reviewer_ko',
        'ops_agent',
        'contributor'
      )
    ),
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon;

-- ── JWT helpers ──────────────────────────────────────────────────────────
-- Platform roles ride in the `app_roles` custom claim (access-token hook,
-- CP2); tests simulate by setting the request.jwt.claims GUC. All helpers
-- are STABLE and fail closed (no claims → no roles, aal null).

create or replace function public.jwt_claims()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function public.jwt_roles()
returns text[]
language sql
stable
as $$
  select coalesce(
    (select array_agg(r) from jsonb_array_elements_text(
      case
        when jsonb_typeof(public.jwt_claims()->'app_roles') = 'array'
          then public.jwt_claims()->'app_roles'
        else '[]'::jsonb
      end
    ) as t(r)),
    '{}'::text[]
  );
$$;

create or replace function public.is_platform(required text[])
returns boolean
language sql
stable
as $$
  select public.jwt_roles() && required;
$$;

create or replace function public.jwt_aal()
returns text
language sql
stable
as $$
  select public.jwt_claims()->>'aal';
$$;

grant execute on function
  public.jwt_claims(),
  public.jwt_roles(),
  public.is_platform(text[]),
  public.jwt_aal()
to anon, authenticated, service_role;
