-- Phase 0 deal/reveal foundation. Deals are staff-created, locale-QA'd, backed
-- by existing approved vendor evidence, and revealed only through a narrow
-- service-role RPC. Vendor requests and billing entitlements remain Phase 1.

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  status text not null default 'requested'
    constraint deals_status_check check (status in ('requested', 'approved', 'active', 'expired', 'killed')),
  reveal_code text not null
    constraint deals_reveal_code_length check (length(trim(reveal_code)) between 1 and 120),
  sponsor_label boolean not null default false,
  reveal_count integer not null default 0 constraint deals_reveal_count_nonnegative check (reveal_count >= 0),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  approval_evidence_media_id uuid references public.media (id) on delete restrict,
  approved_by uuid,
  approved_at timestamptz,
  killed_by uuid,
  killed_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_window_check check (expires_at > starts_at),
  constraint deals_approval_consistency check (
    (status = 'requested' and approval_evidence_media_id is null and approved_by is null and approved_at is null)
    or
    (status in ('approved', 'active', 'expired', 'killed') and approval_evidence_media_id is not null and approved_by is not null and approved_at is not null)
  ),
  constraint deals_kill_consistency check (
    (status = 'killed' and killed_by is not null and killed_at is not null)
    or
    (status <> 'killed' and killed_by is null and killed_at is null)
  )
);

create table public.deal_locales (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  locale text not null constraint deal_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  status text not null default 'qa_pending'
    constraint deal_locales_status_check check (status in ('qa_pending', 'qa_approved', 'published', 'rejected')),
  title text not null constraint deal_locales_title_length check (length(trim(title)) between 2 and 120),
  terms text not null constraint deal_locales_terms_length check (length(trim(terms)) between 3 and 1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, locale),
  constraint deal_locales_review_consistency check (
    (status = 'qa_pending' and reviewed_by is null and reviewed_at is null)
    or
    (status in ('qa_approved', 'published', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

-- Operational dedupe ledger: never directly readable by browser roles.
create table public.deal_reveals (
  deal_id uuid not null references public.deals (id) on delete cascade,
  session_id uuid not null,
  locale text not null constraint deal_reveals_locale_check check (locale in ('en', 'ja', 'ko')),
  revealed_at timestamptz not null default now(),
  primary key (deal_id, session_id)
);

create index deals_public_window_idx on public.deals (status, starts_at, expires_at);
create index deals_listing_idx on public.deals (listing_id, status, expires_at);
create index deal_reveals_time_idx on public.deal_reveals (revealed_at);

alter table public.deals enable row level security;
alter table public.deal_locales enable row level security;
alter table public.deal_reveals enable row level security;
revoke all on table public.deals, public.deal_locales, public.deal_reveals from anon, authenticated;

create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();
create trigger deal_locales_updated_at before update on public.deal_locales
  for each row execute function public.set_updated_at();
create trigger audit_deals after insert or update or delete on public.deals
  for each row execute function public.write_audit('reveal_code');
create trigger audit_deal_locales after insert or update or delete on public.deal_locales
  for each row execute function public.write_audit();

create or replace function public.create_deal(
  p_listing_id uuid,
  p_reveal_code text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_sponsor_label boolean default false
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare v_id uuid;
begin
  if not public.is_platform(array['ops_agent', 'editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: deal creation requires content staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: deal creation requires recent MFA';
  end if;
  if p_expires_at <= p_starts_at or p_expires_at <= now() then
    raise exception 'invalid_deal_window';
  end if;
  if length(trim(coalesce(p_reveal_code, ''))) not between 1 and 120 then
    raise exception 'invalid_reveal_code';
  end if;
  if not exists (select 1 from public.listings where id = p_listing_id) then
    raise exception 'listing_not_found';
  end if;

  insert into public.deals (listing_id, reveal_code, sponsor_label, starts_at, expires_at, created_by)
  values (p_listing_id, trim(p_reveal_code), coalesce(p_sponsor_label, false), p_starts_at, p_expires_at, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_deal_locale(
  p_deal_id uuid,
  p_locale text,
  p_title text,
  p_terms text
)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: localized deal editing requires editorial staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: localized deal editing requires recent MFA';
  end if;
  if p_locale not in ('en', 'ja', 'ko') then raise exception 'invalid_locale'; end if;
  if length(trim(coalesce(p_title, ''))) not between 2 and 120
     or length(trim(coalesce(p_terms, ''))) not between 3 and 1000 then
    raise exception 'invalid_deal_copy';
  end if;
  if not exists (select 1 from public.deals where id = p_deal_id and status = 'requested') then
    raise exception 'deal_not_editable';
  end if;

  insert into public.deal_locales (deal_id, locale, title, terms)
  values (p_deal_id, p_locale, trim(p_title), trim(p_terms))
  on conflict (deal_id, locale) do update set
    title = excluded.title,
    terms = excluded.terms,
    status = 'qa_pending',
    reviewed_by = null,
    reviewed_at = null;
end;
$$;

create or replace function public.review_deal_locale(
  p_deal_locale_id uuid,
  p_approved boolean
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare v_locale text;
begin
  if public.is_platform(array['super_admin', 'publisher', 'editor'])
     and public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: deal QA requires recent MFA';
  end if;
  select locale into v_locale from public.deal_locales where id = p_deal_locale_id and status = 'qa_pending' for update;
  if not found then raise exception 'deal_locale_not_reviewable'; end if;
  if not (
    public.is_platform(array['super_admin', 'publisher'])
    or (v_locale = 'en' and public.is_platform(array['editor']))
    or (v_locale = 'ja' and public.is_platform(array['language_reviewer_ja']))
    or (v_locale = 'ko' and public.is_platform(array['language_reviewer_ko']))
  ) then
    raise exception 'permission_denied: reviewer role does not match deal locale';
  end if;
  update public.deal_locales set
    status = case when p_approved then 'qa_approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_deal_locale_id;
end;
$$;

create or replace function public.activate_deal(p_deal_id uuid, p_evidence_media_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare v_deal public.deals%rowtype;
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: deal activation requires editorial staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: deal activation requires recent MFA';
  end if;
  select * into v_deal from public.deals where id = p_deal_id and status = 'requested' for update;
  if not found then raise exception 'deal_not_activatable'; end if;
  if v_deal.expires_at <= now() then raise exception 'deal_expired'; end if;
  if not exists (
    select 1 from public.media
    where id = p_evidence_media_id and bucket = 'evidence' and kind = 'evidence'
      and moderation_status = 'approved' and rights <> '{}'::jsonb
  ) then raise exception 'approval_evidence_invalid'; end if;
  if not exists (select 1 from public.deal_locales where deal_id = p_deal_id and locale = 'en' and status = 'qa_approved')
     or not exists (select 1 from public.deal_locales where deal_id = p_deal_id and locale = 'ja' and status = 'qa_approved') then
    raise exception 'deal_locales_not_approved';
  end if;
  if exists (select 1 from public.deal_locales where deal_id = p_deal_id and status <> 'qa_approved') then
    raise exception 'deal_locales_not_approved';
  end if;

  update public.deals set
    status = case when starts_at <= now() then 'active' else 'approved' end,
    approval_evidence_media_id = p_evidence_media_id,
    approved_by = auth.uid(), approved_at = now()
  where id = p_deal_id;
  update public.deal_locales set status = 'published' where deal_id = p_deal_id;
end;
$$;

create or replace function public.kill_deal(p_deal_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: deal kill requires editorial staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: deal kill requires recent MFA';
  end if;
  update public.deals set status = 'killed', killed_by = auth.uid(), killed_at = now()
  where id = p_deal_id and status in ('approved', 'active', 'expired');
  if not found then raise exception 'deal_not_killable'; end if;
end;
$$;

create or replace function public.list_admin_deals()
returns table (
  id uuid, listing_id uuid, listing_name text, status text, reveal_code text,
  sponsor_label boolean, reveal_count integer, starts_at timestamptz, expires_at timestamptz,
  approval_evidence_media_id uuid, locales jsonb
)
security definer
set search_path = public
language plpgsql
stable
as $$
begin
  if not public.is_platform(array['ops_agent', 'language_reviewer_ja', 'language_reviewer_ko', 'editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: deal queue requires staff access';
  end if;
  return query
  select d.id, d.listing_id,
    coalesce((select ll.name from public.listing_locales ll where ll.listing_id = d.listing_id and ll.locale = 'en'), d.listing_id::text),
    d.status,
    case when public.is_platform(array['editor', 'publisher', 'super_admin']) then d.reveal_code else '••••••' end,
    d.sponsor_label, d.reveal_count, d.starts_at, d.expires_at, d.approval_evidence_media_id,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dl.id, 'locale', dl.locale, 'status', dl.status,
        'title', dl.title, 'terms', dl.terms, 'reviewed_at', dl.reviewed_at
      ) order by dl.locale)
      from public.deal_locales dl
      where dl.deal_id = d.id
        and (
          not public.is_platform(array['language_reviewer_ja', 'language_reviewer_ko'])
          or (dl.locale = 'ja' and public.is_platform(array['language_reviewer_ja']))
          or (dl.locale = 'ko' and public.is_platform(array['language_reviewer_ko']))
        )
    ), '[]'::jsonb)
  from public.deals d
  order by case d.status when 'requested' then 0 when 'approved' then 1 when 'active' then 2 else 3 end,
    d.expires_at;
end;
$$;

-- Starts scheduled deals and expires elapsed deals. Intended for the existing
-- cron surface and safe to run repeatedly.
create or replace function public.reconcile_deal_statuses()
returns table (activated integer, expired integer)
security definer
set search_path = public
language plpgsql
as $$
declare v_activated integer; v_expired integer;
begin
  update public.deals set status = 'active'
  where status = 'approved' and starts_at <= now() and expires_at > now();
  get diagnostics v_activated = row_count;
  update public.deals set status = 'expired'
  where status in ('approved', 'active') and expires_at <= now();
  get diagnostics v_expired = row_count;
  return query select v_activated, v_expired;
end;
$$;

-- The only public reveal path. Returns no code unless the deal, localized copy,
-- and listing page are all currently publishable. The first reveal per session
-- records the canonical analytics event; repeats return the same code without
-- incrementing the metric.
create or replace function public.reveal_active_deal(p_deal_id uuid, p_locale text, p_session_id uuid)
returns table (result text, reveal_code text, listing_id uuid, counted boolean)
security definer
set search_path = public
language plpgsql
as $$
declare v_deal public.deals%rowtype; v_inserted integer := 0;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if not found then return query select 'not_found'::text, null::text, null::uuid, false; return; end if;
  if v_deal.status in ('expired', 'killed') or v_deal.expires_at <= now() then
    return query select 'expired'::text, null::text, v_deal.listing_id, false; return;
  end if;
  if v_deal.status <> 'active' or v_deal.starts_at > now()
     or not exists (select 1 from public.deal_locales where deal_id = p_deal_id and locale = p_locale and status = 'published')
     or not exists (
       select 1 from public.publishable_locale_pages plp
       where plp.listing_id = v_deal.listing_id and plp.locale = p_locale
     ) then
    return query select 'not_found'::text, null::text, null::uuid, false; return;
  end if;

  insert into public.deal_reveals (deal_id, session_id, locale)
  values (p_deal_id, p_session_id, p_locale)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.deals set reveal_count = reveal_count + 1 where id = p_deal_id;
    insert into public.events (name, source, props, session_id, locale, listing_id, consent_class)
    values ('deal_reveal', 'server', jsonb_build_object('deal_id', p_deal_id), p_session_id::text,
      p_locale, v_deal.listing_id, 'functional');
  end if;
  return query select 'ok'::text, v_deal.reveal_code, v_deal.listing_id, (v_inserted > 0);
end;
$$;

revoke all on function public.create_deal(uuid, text, timestamptz, timestamptz, boolean) from public, anon, service_role;
revoke all on function public.save_deal_locale(uuid, text, text, text) from public, anon, service_role;
revoke all on function public.review_deal_locale(uuid, boolean) from public, anon, service_role;
revoke all on function public.activate_deal(uuid, uuid) from public, anon, service_role;
revoke all on function public.kill_deal(uuid) from public, anon, service_role;
revoke all on function public.list_admin_deals() from public, anon, service_role;
revoke all on function public.reconcile_deal_statuses() from public, anon, authenticated;
revoke all on function public.reveal_active_deal(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_deal(uuid, text, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.save_deal_locale(uuid, text, text, text) to authenticated;
grant execute on function public.review_deal_locale(uuid, boolean) to authenticated;
grant execute on function public.activate_deal(uuid, uuid) to authenticated;
grant execute on function public.kill_deal(uuid) to authenticated;
grant execute on function public.list_admin_deals() to authenticated;
grant execute on function public.reconcile_deal_statuses() to service_role;
grant execute on function public.reveal_active_deal(uuid, text, uuid) to service_role;
