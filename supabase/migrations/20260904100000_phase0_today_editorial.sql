-- Phase 0 weekly /today editorial. Staff prepare localized copy and an ordered
-- shortlist of existing listings; publisher/super_admin release one edition at
-- a time. Automation and personalization remain out of scope.

create table public.today_editions (
  id uuid primary key default gen_random_uuid(),
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  week_of date not null,
  status text not null default 'draft'
    constraint today_editions_status_check check (status in ('draft', 'published', 'archived')),
  created_by uuid not null,
  published_by uuid,
  published_at timestamptz,
  archived_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, week_of),
  constraint today_editions_week_monday check (extract(isodow from week_of) = 1),
  constraint today_editions_publish_consistency check (
    (status = 'draft' and published_by is null and published_at is null and archived_by is null and archived_at is null)
    or (status = 'published' and published_by is not null and published_at is not null and archived_by is null and archived_at is null)
    or (status = 'archived' and published_by is not null and published_at is not null and archived_by is not null and archived_at is not null)
  )
);

create unique index today_editions_one_published_idx
  on public.today_editions (market_id) where status = 'published';

create table public.today_edition_locales (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.today_editions (id) on delete cascade,
  locale text not null constraint today_edition_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  status text not null default 'qa_pending'
    constraint today_edition_locales_status_check check (status in ('qa_pending', 'qa_approved', 'published', 'rejected')),
  title text not null constraint today_edition_locales_title_length check (length(trim(title)) between 2 and 120),
  dek text not null constraint today_edition_locales_dek_length check (length(trim(dek)) between 3 and 280),
  body text not null constraint today_edition_locales_body_length check (length(trim(body)) between 20 and 5000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, locale),
  constraint today_edition_locales_review_consistency check (
    (status = 'qa_pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('qa_approved', 'published', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create table public.today_edition_items (
  edition_id uuid not null references public.today_editions (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete restrict,
  position smallint not null constraint today_edition_items_position_check check (position between 1 and 6),
  created_at timestamptz not null default now(),
  primary key (edition_id, listing_id),
  unique (edition_id, position)
);

alter table public.today_editions enable row level security;
alter table public.today_edition_locales enable row level security;
alter table public.today_edition_items enable row level security;
revoke all on table public.today_editions, public.today_edition_locales, public.today_edition_items from anon, authenticated;

create trigger today_editions_updated_at before update on public.today_editions
  for each row execute function public.set_updated_at();
create trigger today_edition_locales_updated_at before update on public.today_edition_locales
  for each row execute function public.set_updated_at();
create trigger audit_today_editions after insert or update or delete on public.today_editions
  for each row execute function public.write_audit();
create trigger audit_today_edition_locales after insert or update or delete on public.today_edition_locales
  for each row execute function public.write_audit();
create trigger audit_today_edition_items after insert or update or delete on public.today_edition_items
  for each row execute function public.write_audit();

create or replace function public.create_today_edition(p_week_of date)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare v_id uuid;
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: edition creation requires editorial staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: edition creation requires recent MFA';
  end if;
  if p_week_of is null or extract(isodow from p_week_of) <> 1 then
    raise exception 'invalid_week: week_of must be a Monday';
  end if;
  insert into public.today_editions (week_of, created_by)
  values (p_week_of, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_today_edition_locale(
  p_edition_id uuid, p_locale text, p_title text, p_dek text, p_body text
)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  if not (
    public.is_platform(array['publisher', 'super_admin'])
    or (p_locale = 'en' and public.is_platform(array['editor']))
    or (p_locale = 'ja' and public.is_platform(array['language_reviewer_ja']))
    or (p_locale = 'ko' and public.is_platform(array['language_reviewer_ko']))
  ) then raise exception 'permission_denied: editor role does not match edition locale'; end if;
  if public.is_platform(array['editor', 'publisher', 'super_admin'])
     and public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: edition editing requires recent MFA';
  end if;
  if p_locale not in ('en', 'ja', 'ko') then raise exception 'invalid_locale'; end if;
  if length(trim(coalesce(p_title, ''))) not between 2 and 120
     or length(trim(coalesce(p_dek, ''))) not between 3 and 280
     or length(trim(coalesce(p_body, ''))) not between 20 and 5000 then
    raise exception 'invalid_edition_copy';
  end if;
  if not exists (select 1 from public.today_editions where id = p_edition_id and status = 'draft') then
    raise exception 'edition_not_editable';
  end if;
  insert into public.today_edition_locales (edition_id, locale, title, dek, body)
  values (p_edition_id, p_locale, trim(p_title), trim(p_dek), trim(p_body))
  on conflict (edition_id, locale) do update set
    title = excluded.title, dek = excluded.dek, body = excluded.body,
    status = 'qa_pending', reviewed_by = null, reviewed_at = null;
end;
$$;

create or replace function public.review_today_edition_locale(p_locale_id uuid, p_approved boolean)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare v_locale text;
begin
  if public.is_platform(array['editor', 'publisher', 'super_admin'])
     and public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: edition review requires recent MFA';
  end if;
  select tel.locale into v_locale
  from public.today_edition_locales tel join public.today_editions te on te.id = tel.edition_id
  where tel.id = p_locale_id and tel.status = 'qa_pending' and te.status = 'draft' for update of tel;
  if not found then raise exception 'edition_locale_not_reviewable'; end if;
  if not (
    public.is_platform(array['publisher', 'super_admin'])
    or (v_locale = 'en' and public.is_platform(array['editor']))
    or (v_locale = 'ja' and public.is_platform(array['language_reviewer_ja']))
    or (v_locale = 'ko' and public.is_platform(array['language_reviewer_ko']))
  ) then raise exception 'permission_denied: reviewer role does not match edition locale'; end if;
  update public.today_edition_locales set
    status = case when p_approved then 'qa_approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_locale_id;
end;
$$;

create or replace function public.set_today_edition_items(p_edition_id uuid, p_listing_ids uuid[])
returns void
security definer
set search_path = public
language plpgsql
as $$
declare v_count integer := coalesce(cardinality(p_listing_ids), 0);
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: shortlist editing requires editorial staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: shortlist editing requires recent MFA';
  end if;
  if not exists (select 1 from public.today_editions where id = p_edition_id and status = 'draft' for update) then
    raise exception 'edition_not_editable';
  end if;
  if v_count not between 1 and 6 then raise exception 'invalid_shortlist_size'; end if;
  if (select count(distinct selected_id) from unnest(p_listing_ids) selected_id) <> v_count then
    raise exception 'duplicate_shortlist_item';
  end if;
  if exists (
    select 1 from unnest(p_listing_ids) selected_id
    where not exists (
      select 1 from public.listings l
      join public.today_editions te on te.id = p_edition_id
      where l.id = selected_id and l.market_id = te.market_id
    )
  ) then
    raise exception 'listing_not_found';
  end if;
  delete from public.today_edition_items where edition_id = p_edition_id;
  insert into public.today_edition_items (edition_id, listing_id, position)
  select p_edition_id, selected_id, ordinality::smallint
  from unnest(p_listing_ids) with ordinality selected(selected_id, ordinality);
end;
$$;

create or replace function public.publish_today_edition(p_edition_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare v_edition public.today_editions%rowtype;
begin
  if not public.is_platform(array['publisher', 'super_admin']) then
    raise exception 'permission_denied: edition publishing requires publisher';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: edition publishing requires recent MFA';
  end if;
  select * into v_edition from public.today_editions where id = p_edition_id and status = 'draft' for update;
  if not found then raise exception 'edition_not_publishable'; end if;
  if v_edition.week_of > (timezone('Pacific/Honolulu', now()))::date then raise exception 'edition_week_not_started'; end if;
  if not exists (select 1 from public.today_edition_locales where edition_id = p_edition_id and locale = 'en' and status = 'qa_approved')
     or not exists (select 1 from public.today_edition_locales where edition_id = p_edition_id and locale = 'ja' and status = 'qa_approved')
     or exists (select 1 from public.today_edition_locales where edition_id = p_edition_id and status <> 'qa_approved') then
    raise exception 'edition_locales_not_approved';
  end if;
  if (select count(*) from public.today_edition_items where edition_id = p_edition_id) not between 1 and 6 then
    raise exception 'edition_shortlist_required';
  end if;
  if exists (
    select 1 from public.today_edition_items i
    where i.edition_id = p_edition_id and (
      not exists (select 1 from public.publishable_locale_pages p where p.listing_id = i.listing_id and p.locale = 'en')
      or not exists (select 1 from public.publishable_locale_pages p where p.listing_id = i.listing_id and p.locale = 'ja')
    )
  ) then raise exception 'edition_listing_not_publishable'; end if;

  update public.today_editions set status = 'archived', archived_by = auth.uid(), archived_at = now()
  where status = 'published' and market_id = v_edition.market_id;
  update public.today_editions set status = 'published', published_by = auth.uid(), published_at = now()
  where id = p_edition_id;
  update public.today_edition_locales set status = 'published' where edition_id = p_edition_id;
end;
$$;

create or replace function public.archive_today_edition(p_edition_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  if not public.is_platform(array['publisher', 'super_admin']) then
    raise exception 'permission_denied: edition archiving requires publisher';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: edition archiving requires recent MFA';
  end if;
  update public.today_editions set status = 'archived', archived_by = auth.uid(), archived_at = now()
  where id = p_edition_id and status = 'published';
  if not found then raise exception 'edition_not_archivable'; end if;
end;
$$;

create or replace function public.list_admin_today_editions()
returns table (id uuid, week_of date, status text, published_at timestamptz, locales jsonb, items jsonb)
security definer
set search_path = public
language plpgsql
stable
as $$
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent']) then
    raise exception 'permission_denied: edition queue requires staff access';
  end if;
  return query
  select te.id, te.week_of, te.status, te.published_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', tel.id, 'locale', tel.locale, 'status', tel.status,
      'title', tel.title, 'dek', tel.dek, 'body', tel.body, 'reviewed_at', tel.reviewed_at
    ) order by tel.locale) from public.today_edition_locales tel where tel.edition_id = te.id and (
      not public.is_platform(array['language_reviewer_ja', 'language_reviewer_ko'])
      or (tel.locale = 'ja' and public.is_platform(array['language_reviewer_ja']))
      or (tel.locale = 'ko' and public.is_platform(array['language_reviewer_ko']))
    )), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'listing_id', i.listing_id,
      'listing_name', coalesce((select ll.name from public.listing_locales ll where ll.listing_id = i.listing_id and ll.locale = 'en'), i.listing_id::text),
      'position', i.position
    ) order by i.position) from public.today_edition_items i where i.edition_id = te.id), '[]'::jsonb)
  from public.today_editions te order by te.week_of desc;
end;
$$;

revoke execute on function public.create_today_edition(date) from public, anon;
revoke execute on function public.save_today_edition_locale(uuid, text, text, text, text) from public, anon;
revoke execute on function public.review_today_edition_locale(uuid, boolean) from public, anon;
revoke execute on function public.set_today_edition_items(uuid, uuid[]) from public, anon;
revoke execute on function public.publish_today_edition(uuid) from public, anon;
revoke execute on function public.archive_today_edition(uuid) from public, anon;
revoke execute on function public.list_admin_today_editions() from public, anon;
grant execute on function public.create_today_edition(date) to authenticated;
grant execute on function public.save_today_edition_locale(uuid, text, text, text, text) to authenticated;
grant execute on function public.review_today_edition_locale(uuid, boolean) to authenticated;
grant execute on function public.set_today_edition_items(uuid, uuid[]) to authenticated;
grant execute on function public.publish_today_edition(uuid) to authenticated;
grant execute on function public.archive_today_edition(uuid) to authenticated;
grant execute on function public.list_admin_today_editions() to authenticated;
