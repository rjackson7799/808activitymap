-- Phase 0 locale QA operations (PRD §10/§11, TSD §10).
-- Queue ownership and active work time are durable, audited records. All
-- mutations are function-owned; authenticated users receive SELECT only via
-- the generated RLS migration that follows this file.

create table public.qa_assignments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('listing_locale', 'menu_locale')),
  target_id uuid not null,
  locale text not null check (locale in ('en', 'ja', 'ko')),
  assigned_to uuid not null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text check (outcome is null or outcome in ('approved', 'rework')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id)
);

create table public.qa_work_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.qa_assignments(id) on delete restrict,
  actor uuid not null,
  work_type text not null default 'translation_qa' check (work_type = 'translation_qa'),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active_minutes numeric(10,2),
  end_reason text check (end_reason is null or end_reason in ('paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((ended_at is null and active_minutes is null and end_reason is null)
      or (ended_at is not null and active_minutes is not null and end_reason is not null))
);

create unique index qa_work_sessions_one_active_actor
  on public.qa_work_sessions(actor) where ended_at is null;
create index qa_assignments_queue_idx on public.qa_assignments(locale, completed_at, assigned_at);
create index qa_work_sessions_assignment_idx on public.qa_work_sessions(assignment_id, started_at);

alter table public.qa_assignments enable row level security;
alter table public.qa_work_sessions enable row level security;
revoke all on public.qa_assignments, public.qa_work_sessions from anon, authenticated;

create trigger qa_assignments_updated_at before update on public.qa_assignments
  for each row execute function public.set_updated_at();
create trigger qa_work_sessions_updated_at before update on public.qa_work_sessions
  for each row execute function public.set_updated_at();
create trigger audit_qa_assignments after insert or update or delete on public.qa_assignments
  for each row execute function public.write_audit();
create trigger audit_qa_work_sessions after insert or update or delete on public.qa_work_sessions
  for each row execute function public.write_audit();

create or replace function public.assert_qa_actor(p_locale text)
returns void security definer set search_path = public language plpgsql stable as $$
begin
  if p_locale not in ('ja', 'ko') then raise exception 'invalid_qa_locale'; end if;
  if public.is_platform(array['language_reviewer_' || p_locale]) then return; end if;
  if public.is_platform(array['publisher', 'super_admin']) then
    if public.jwt_aal() is distinct from 'aal2' then
      raise exception 'aal2_required: privileged QA work requires recent MFA';
    end if;
    return;
  end if;
  raise exception 'permission_denied: QA work requires the matching language reviewer';
end;
$$;

create or replace function public.assert_qa_target(p_type text, p_id uuid, p_locale text)
returns void security definer set search_path = public language plpgsql stable as $$
begin
  if p_type = 'listing_locale' then
    if not exists(select 1 from public.listing_locales where id=p_id and locale=p_locale and status='qa_pending') then
      raise exception 'qa_item_unavailable: listing locale is not pending QA';
    end if;
  elsif p_type = 'menu_locale' then
    if not exists(select 1 from public.menu_version_locales where id=p_id and locale=p_locale and status='qa_pending') then
      raise exception 'qa_item_unavailable: menu locale is not pending QA';
    end if;
  else
    raise exception 'invalid_qa_target';
  end if;
end;
$$;

create or replace function public.claim_qa_item(p_type text, p_id uuid, p_locale text)
returns uuid security definer set search_path = public language plpgsql as $$
declare v_id uuid; v_assignee uuid;
begin
  perform public.assert_qa_actor(p_locale);
  perform public.assert_qa_target(p_type, p_id, p_locale);
  select id, assigned_to into v_id, v_assignee from public.qa_assignments
    where target_type=p_type and target_id=p_id for update;
  if v_id is not null and v_assignee <> auth.uid() then
    raise exception 'qa_item_claimed: this item is assigned to another reviewer';
  end if;
  if v_id is null then
    insert into public.qa_assignments(target_type,target_id,locale,assigned_to)
      values(p_type,p_id,p_locale,auth.uid()) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.start_qa_work(p_type text, p_id uuid, p_locale text)
returns uuid security definer set search_path = public language plpgsql as $$
declare v_assignment uuid; v_session uuid;
begin
  v_assignment := public.claim_qa_item(p_type,p_id,p_locale);
  if exists(select 1 from public.qa_work_sessions where actor=auth.uid() and ended_at is null) then
    raise exception 'qa_session_active: pause your current work session first';
  end if;
  insert into public.qa_work_sessions(assignment_id,actor)
    values(v_assignment,auth.uid()) returning id into v_session;
  return v_session;
end;
$$;

create or replace function public.pause_qa_work(p_type text, p_id uuid, p_locale text)
returns void security definer set search_path = public language plpgsql as $$
begin
  perform public.assert_qa_actor(p_locale);
  update public.qa_work_sessions s set
    ended_at=now(), active_minutes=round((extract(epoch from (now()-s.started_at))/60.0)::numeric,2), end_reason='paused'
  from public.qa_assignments a
  where s.assignment_id=a.id and s.actor=auth.uid() and s.ended_at is null
    and a.target_type=p_type and a.target_id=p_id and a.locale=p_locale;
  if not found then raise exception 'qa_session_not_active'; end if;
end;
$$;

create or replace function public.decide_qa_item(
  p_type text, p_id uuid, p_locale text, p_outcome text
) returns void security definer set search_path = public language plpgsql as $$
declare v_assignment uuid; v_listing_id uuid;
begin
  perform public.assert_qa_actor(p_locale);
  perform public.assert_qa_target(p_type,p_id,p_locale);
  if p_outcome not in ('approved','rework') then raise exception 'invalid_qa_outcome'; end if;
  v_assignment := public.claim_qa_item(p_type,p_id,p_locale);

  if p_type='listing_locale' then
    select listing_id into v_listing_id from public.listing_locales where id=p_id;
    perform public.transition_listing_locale(v_listing_id,p_locale,
      case when p_outcome='approved' then 'qa_approved' else 'machine_draft' end);
  else
    perform public.transition_menu_version_locale(p_id,
      case when p_outcome='approved' then 'qa_approved' else 'rejected' end);
  end if;

  update public.qa_work_sessions set
    ended_at=now(), active_minutes=round((extract(epoch from (now()-started_at))/60.0)::numeric,2), end_reason='completed'
  where assignment_id=v_assignment and actor=auth.uid() and ended_at is null;
  update public.qa_assignments set completed_at=now(), outcome=p_outcome where id=v_assignment;
end;
$$;

revoke execute on function public.assert_qa_actor(text) from public, anon, authenticated;
revoke execute on function public.assert_qa_target(text,uuid,text) from public, anon, authenticated;
revoke execute on function public.claim_qa_item(text,uuid,text) from public, anon;
revoke execute on function public.start_qa_work(text,uuid,text) from public, anon;
revoke execute on function public.pause_qa_work(text,uuid,text) from public, anon;
revoke execute on function public.decide_qa_item(text,uuid,text,text) from public, anon;
grant execute on function public.claim_qa_item(text,uuid,text) to authenticated;
grant execute on function public.start_qa_work(text,uuid,text) to authenticated;
grant execute on function public.pause_qa_work(text,uuid,text) to authenticated;
grant execute on function public.decide_qa_item(text,uuid,text,text) to authenticated;
