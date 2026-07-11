-- Migration 16: §4 reconciliation + the listing-locale QA workflow fn (CP2).
--
-- Two corrections to mirror PRD §4 exactly, plus one gap-fill:
--
--  1. transition_menu_version_locale — the "→ approved" edge now includes
--     ops_agent (PRD §4 "Vendor approval of menu": editor "record external
--     (D1)", ops_agent "record external"), and platform staff may only RECORD
--     an off-platform written approval: approval_type must be
--     'vendor_approved_external'. 'portal' is the vendor's own in-portal act
--     and arrives with vendor auth in Slice 3.
--     aal2 is required uniformly on the approve edge — including ops_agent,
--     a deliberate extension beyond the PRD's three MFA-mandated roles
--     (approval is publication-critical; owner-confirmed → ADR-001).
--     Role and aal failures are now distinguished (permission_denied vs
--     aal2_required) so callers can react correctly.
--
--  2. transition_listing_locale — NEW guarded fn for the pre-publication
--     ladder (PRD §6). Required because listing_locales.status becomes
--     fn-owned (column-scoped grants, migration 18) and migration 15 only
--     covers menu locales + publish/unpublish. Edges:
--       not_started → machine_draft            publisher+ @aal2 (MT service
--                                              path arrives Slice 2)
--       not_started | machine_draft → qa_pending
--                                              reviewer own-locale (no aal2)
--                                              or publisher+ @aal2; the
--                                              not_started → qa_pending edge
--                                              is the human-authored (EN) path
--       qa_pending → qa_approved               same actors
--       qa_pending → machine_draft (rework)    same actors
--       qa_approved → vendor_review_pending    publisher+ @aal2 (Slice 3
--       vendor_review_pending → vendor_approved  vendor flows; staff records)
--     No edge to published/withdrawn (owned by publish/unpublish_listing_
--     locale) and NO edge to stale: D15/ADR-008 — a serving locale never
--     leaves the serving set via status; freshness renders as an amber chip.
--     Editor is excluded everywhere: PRD §4 "Translation edit/QA approve"
--     marks editor ✖.

-- ── 1. Menu transition reconciliation ────────────────────────────────────

create or replace function public.transition_menu_version_locale(
  p_id uuid,
  p_to_status text,
  p_approval_type text default null,
  p_evidence_media_id uuid default null
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_row public.menu_version_locales%rowtype;
  v_role_ok boolean := false;
  v_need_aal2 boolean := false;
  v_reviewer_role text;
begin
  select * into v_row from public.menu_version_locales where id = p_id for update;
  if v_row.id is null then
    raise exception 'menu_version_locale % not found', p_id;
  end if;

  -- valid state machine edges
  if not (
    (v_row.status = 'translation_pending' and p_to_status = 'qa_pending') or
    (v_row.status = 'qa_pending' and p_to_status in ('qa_approved', 'rejected')) or
    (v_row.status = 'qa_approved' and p_to_status in ('vendor_approval_pending', 'approved')) or
    (v_row.status = 'vendor_approval_pending' and p_to_status in ('approved', 'rejected')) or
    (v_row.status = 'approved' and p_to_status in ('published', 'superseded')) or
    (v_row.status = 'published' and p_to_status = 'superseded') or
    (v_row.status = 'rejected' and p_to_status = 'qa_pending')
  ) then
    raise exception 'invalid_transition: menu_version_locale % → %',
      v_row.status, p_to_status;
  end if;

  v_reviewer_role := 'language_reviewer_' || v_row.locale;

  if p_to_status in ('qa_pending', 'vendor_approval_pending') then
    v_role_ok := public.is_platform(
      array['editor', 'ops_agent', 'publisher', 'super_admin']);
  elsif p_to_status in ('qa_approved', 'rejected') then
    -- language reviewers approve ONLY their own locale, no MFA mandate
    if public.is_platform(array[v_reviewer_role]) then
      v_role_ok := true;
    elsif public.is_platform(array['publisher', 'super_admin']) then
      v_role_ok := true;
      v_need_aal2 := true;
    end if;
  elsif p_to_status = 'approved' then
    -- §4 "Vendor approval of menu": editor + ops_agent record external;
    -- publisher/super_admin retained ("—" read as N/A, not deny — ADR-001)
    v_role_ok := public.is_platform(
      array['editor', 'ops_agent', 'publisher', 'super_admin']);
    v_need_aal2 := true;
  elsif p_to_status in ('published', 'superseded') then
    v_role_ok := public.is_platform(array['publisher', 'super_admin']);
    v_need_aal2 := true;
  end if;

  if not v_role_ok then
    raise exception
      'permission_denied: role insufficient for menu transition to %', p_to_status;
  end if;
  if v_need_aal2 and public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: privileged mutation requires recent MFA';
  end if;

  if p_to_status = 'approved' then
    if coalesce(p_approval_type, '') = '' then
      raise exception 'approval_type required when approving (vendor_approved_external)';
    end if;
    if p_approval_type <> 'vendor_approved_external' then
      raise exception
        'approval_type must be vendor_approved_external (D1): platform staff record off-platform written approval; portal approval is the vendor''s act (Slice 3)';
    end if;
  end if;

  update public.menu_version_locales
  set status = p_to_status,
      approval_type = case
        when p_to_status = 'approved' then p_approval_type
        else approval_type
      end,
      approval_evidence_media_id = case
        when p_to_status = 'approved' then coalesce(p_evidence_media_id, approval_evidence_media_id)
        else approval_evidence_media_id
      end,
      approved_by = case
        when p_to_status = 'approved' then auth.uid()
        else approved_by
      end,
      approved_at = case
        when p_to_status = 'approved' then now()
        else approved_at
      end
  where id = p_id;

  insert into public.audit_log
    (actor, actor_source, action, target_table, target_id, before, after, request_id)
  values (
    auth.uid(), 'jwt', 'transition_menu_version_locale',
    'menu_version_locales', p_id::text,
    jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', p_to_status, 'approval_type', p_approval_type),
    nullif(current_setting('app.request_id', true), '')
  );
end;
$$;

-- ── 2. Listing-locale QA workflow ────────────────────────────────────────

create or replace function public.transition_listing_locale(
  p_listing_id uuid,
  p_locale text,
  p_to_status text
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_row public.listing_locales%rowtype;
  v_role_ok boolean := false;
  v_need_aal2 boolean := false;
  v_reviewer_role text;
begin
  select * into v_row from public.listing_locales
  where listing_id = p_listing_id and locale = p_locale
  for update;
  if v_row.id is null then
    raise exception 'listing_locale %/% not found', p_listing_id, p_locale;
  end if;

  -- valid state machine edges (publish/withdraw/stale are NOT edges here)
  if not (
    (v_row.status = 'not_started' and p_to_status in ('machine_draft', 'qa_pending')) or
    (v_row.status = 'machine_draft' and p_to_status = 'qa_pending') or
    (v_row.status = 'qa_pending' and p_to_status in ('qa_approved', 'machine_draft')) or
    (v_row.status = 'qa_approved' and p_to_status = 'vendor_review_pending') or
    (v_row.status = 'vendor_review_pending' and p_to_status = 'vendor_approved')
  ) then
    raise exception 'invalid_transition: listing_locale % → %',
      v_row.status, p_to_status;
  end if;

  v_reviewer_role := 'language_reviewer_' || p_locale;

  if p_to_status = 'machine_draft' and v_row.status = 'not_started' then
    -- MT staging; the pipeline service path arrives Slice 2
    v_role_ok := public.is_platform(array['publisher', 'super_admin']);
    v_need_aal2 := true;
  elsif p_to_status in ('qa_pending', 'qa_approved')
     or (p_to_status = 'machine_draft' and v_row.status = 'qa_pending') then
    if public.is_platform(array[v_reviewer_role]) then
      v_role_ok := true;
    elsif public.is_platform(array['publisher', 'super_admin']) then
      v_role_ok := true;
      v_need_aal2 := true;
    end if;
  elsif p_to_status in ('vendor_review_pending', 'vendor_approved') then
    v_role_ok := public.is_platform(array['publisher', 'super_admin']);
    v_need_aal2 := true;
  end if;

  if not v_role_ok then
    raise exception
      'permission_denied: role insufficient for listing_locale transition to %',
      p_to_status;
  end if;
  if v_need_aal2 and public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: privileged mutation requires recent MFA';
  end if;

  update public.listing_locales
  set status = p_to_status
  where id = v_row.id;

  insert into public.audit_log
    (actor, actor_source, action, target_table, target_id, before, after, request_id)
  values (
    auth.uid(), 'jwt', 'transition_listing_locale',
    'listing_locales', v_row.id::text,
    jsonb_build_object('status', v_row.status),
    jsonb_build_object('listing_id', p_listing_id, 'locale', p_locale, 'status', p_to_status),
    nullif(current_setting('app.request_id', true), '')
  );
end;
$$;

revoke execute on function public.transition_listing_locale(uuid, text, text) from public, anon;
grant execute on function public.transition_listing_locale(uuid, text, text) to authenticated, service_role;
