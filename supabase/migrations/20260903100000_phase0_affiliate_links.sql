-- Phase 0 affiliate modules: staff-curated links, public redirect resolution,
-- server-side clickout measurement, and service-owned health state. This does
-- not add booking, partner API, sponsored placement, or vendor portal flows.

create table public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  partner_key text not null constraint affiliate_links_partner_key_check
    check (partner_key ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  partner_name text not null constraint affiliate_links_partner_name_check
    check (length(trim(partner_name)) between 2 and 80),
  destination_url text not null constraint affiliate_links_destination_check
    check (
      length(destination_url) between 10 and 2000
      and destination_url ~ '^https://[^[:space:]]+$'
    ),
  context text not null default 'nearby_activity' constraint affiliate_links_context_check
    check (context in ('nearby_activity', 'reservation', 'transportation', 'other')),
  status text not null default 'active' constraint affiliate_links_status_check
    check (status in ('active', 'hidden', 'dead')),
  sort_order integer not null default 0,
  consecutive_failures integer not null default 0 constraint affiliate_links_failures_check
    check (consecutive_failures >= 0),
  last_checked_at timestamptz,
  last_http_status integer,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, partner_key, context)
);

create index affiliate_links_public_idx on public.affiliate_links (listing_id, status, sort_order);
create index affiliate_links_health_idx on public.affiliate_links (status, last_checked_at);

alter table public.affiliate_links enable row level security;
revoke all on table public.affiliate_links from anon, authenticated;

create trigger affiliate_links_updated_at before update on public.affiliate_links
  for each row execute function public.set_updated_at();
create trigger audit_affiliate_links after insert or update or delete on public.affiliate_links
  for each row execute function public.write_audit();

create or replace function public.is_safe_affiliate_destination(p_url text)
returns boolean
language sql
immutable
as $$
  select p_url is not null
    and length(p_url) between 10 and 2000
    and p_url ~ '^https://[^[:space:]]+$'
    and p_url !~* '^https://[^/]*@'
    and p_url !~* '^https://[^/?#]*:[0-9]+'
    and p_url !~* '^https://(localhost|[^/?#]+\.(localhost|local|internal)|0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|\[::|\[f[cd]|\[fe[89ab])';
$$;

create or replace function public.create_affiliate_link(
  p_listing_id uuid,
  p_partner_key text,
  p_partner_name text,
  p_destination_url text,
  p_context text default 'nearby_activity',
  p_sort_order integer default 0
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare v_id uuid;
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: affiliate link creation requires editor access';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: affiliate link creation requires recent MFA';
  end if;
  if not exists (select 1 from public.listings where id = p_listing_id) then
    raise exception 'listing_not_found';
  end if;
  if not public.is_safe_affiliate_destination(trim(p_destination_url)) then
    raise exception 'invalid_affiliate_destination';
  end if;
  insert into public.affiliate_links (
    listing_id, partner_key, partner_name, destination_url, context, sort_order, created_by
  ) values (
    p_listing_id, lower(trim(p_partner_key)), trim(p_partner_name), trim(p_destination_url),
    p_context, p_sort_order, auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_affiliate_link_status(p_link_id uuid, p_status text)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare v_listing_id uuid;
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: affiliate link status requires editor access';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: affiliate link status requires recent MFA';
  end if;
  if p_status not in ('active', 'hidden') then raise exception 'invalid_affiliate_status'; end if;
  update public.affiliate_links
  set status = p_status,
      consecutive_failures = case when p_status = 'active' then 0 else consecutive_failures end
  where id = p_link_id
  returning listing_id into v_listing_id;
  if not found then raise exception 'affiliate_link_not_found'; end if;
  return v_listing_id;
end;
$$;

create or replace function public.list_admin_affiliate_links()
returns table (
  id uuid, listing_id uuid, listing_name text, partner_key text, partner_name text,
  destination_url text, context text, status text, sort_order integer,
  consecutive_failures integer, last_checked_at timestamptz, last_http_status integer
)
security definer
set search_path = public
language plpgsql
stable
as $$
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: affiliate link queue requires editor access';
  end if;
  return query
  select a.id, a.listing_id,
    coalesce((select ll.name from public.listing_locales ll where ll.listing_id = a.listing_id and ll.locale = 'en'), a.listing_id::text),
    a.partner_key, a.partner_name, a.destination_url, a.context, a.status, a.sort_order,
    a.consecutive_failures, a.last_checked_at, a.last_http_status
  from public.affiliate_links a
  order by a.status, a.sort_order, a.partner_name;
end;
$$;

create or replace function public.resolve_affiliate_clickout(p_link_id uuid, p_locale text)
returns table (destination_url text, partner_key text, context text, listing_id uuid)
security definer
set search_path = public
language sql
stable
as $$
  select a.destination_url, a.partner_key, a.context, a.listing_id
  from public.affiliate_links a
  where a.id = p_link_id
    and a.status = 'active'
    and p_locale in ('en', 'ja', 'ko')
    and exists (
      select 1 from public.publishable_locale_pages p
      where p.listing_id = a.listing_id and p.locale = p_locale
    );
$$;

create or replace function public.list_due_affiliate_links(p_limit integer default 20)
returns table (id uuid, destination_url text)
security definer
set search_path = public
language plpgsql
stable
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'permission_denied'; end if;
  return query
  select a.id, a.destination_url
  from public.affiliate_links a
  where a.status = 'active'
    and (a.last_checked_at is null or a.last_checked_at < now() - interval '7 days')
  order by a.last_checked_at nulls first, a.id
  limit greatest(0, least(coalesce(p_limit, 20), 100));
end;
$$;

create or replace function public.record_affiliate_link_health(
  p_link_id uuid, p_http_status integer, p_healthy boolean
)
returns text
security definer
set search_path = public
language plpgsql
as $$
declare v_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'permission_denied'; end if;
  update public.affiliate_links
  set last_checked_at = now(),
      last_http_status = p_http_status,
      consecutive_failures = case when p_healthy then 0 else consecutive_failures + 1 end,
      status = case
        when p_healthy then 'active'
        when consecutive_failures + 1 >= 2 then 'dead'
        else status
      end
  where id = p_link_id and status = 'active'
  returning status into v_status;
  return v_status;
end;
$$;

revoke all on function public.create_affiliate_link(uuid,text,text,text,text,integer) from public, anon, service_role;
revoke all on function public.is_safe_affiliate_destination(text) from public, anon, authenticated, service_role;
revoke all on function public.set_affiliate_link_status(uuid,text) from public, anon, service_role;
revoke all on function public.list_admin_affiliate_links() from public, anon, service_role;
revoke all on function public.resolve_affiliate_clickout(uuid,text) from public, anon, authenticated;
revoke all on function public.list_due_affiliate_links(integer) from public, anon, authenticated;
revoke all on function public.record_affiliate_link_health(uuid,integer,boolean) from public, anon, authenticated;
grant execute on function public.create_affiliate_link(uuid,text,text,text,text,integer) to authenticated;
grant execute on function public.set_affiliate_link_status(uuid,text) to authenticated;
grant execute on function public.list_admin_affiliate_links() to authenticated;
grant execute on function public.resolve_affiliate_clickout(uuid,text) to service_role;
grant execute on function public.list_due_affiliate_links(integer) to service_role;
grant execute on function public.record_affiliate_link_health(uuid,integer,boolean) to service_role;
