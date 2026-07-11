-- Migration 15: the publication contract (PRD §6/§11 as narrowed by ADR-008).
--
-- Three pieces:
--  1. publishable_locale_pages — the narrow eligibility view (TSD §5). The
--     single source for generateStaticParams, sitemaps, revalidation, and
--     the mandatory join filter for every public page-data query (ADR-004).
--     Anon/authenticated get NO grant — server-only via service role.
--  2. can_publish_listing_locale() — structured blockers; empty ⇒
--     publishable. Enforcement, not advice: the publish transition calls it.
--  3. Guarded transition functions (SECURITY DEFINER, narrow): the ONLY
--     write paths for publication-critical state. Each checks role + aal2 +
--     blockers + valid state transition and writes an intent audit row
--     atomically (table triggers capture the row-level before/after).
--
-- Post-publish staleness (D15): provenance_expired is a PUBLISH-TIME blocker
-- only. A published page whose provenance later expires renders an amber
-- verified-chip computed from provenance rows — its locale status never
-- leaves the serving set and the page is not unpublished.

-- ── 1. Eligibility view ──────────────────────────────────────────────────

create view public.publishable_locale_pages
with (security_invoker = false)
as
select ll.listing_id, ll.locale
from public.listing_locales ll
join public.listings l on l.id = ll.listing_id
join public.locations loc on loc.id = l.location_id
where l.publication_status = 'published'
  and ll.status in ('qa_approved', 'vendor_approved', 'published')
  -- minimum field set (structural checks; PRD §6)
  and coalesce(ll.name, '') <> ''
  and ll.slug is not null
  and loc.address is not null
  and exists (
    select 1 from public.hours_sets hs where hs.location_id = loc.id
  )
  -- primary-category completeness in this locale (D4 + taxonomy prerequisite)
  and l.primary_category_id is not null
  and exists (
    select 1
    from public.categories c
    join public.category_locales cl
      on cl.category_id = c.id and cl.locale = ll.locale
    where c.id = l.primary_category_id
      and c.active
      and c.publicly_visible
      and coalesce(cl.label, '') <> ''
      and coalesce(cl.slug, '') <> ''
  )
  and exists (
    select 1 from public.listing_categories lc
    where lc.listing_id = l.id and lc.category_id = l.primary_category_id
  )
  -- ≥1 approved photo with rights metadata
  and exists (
    select 1
    from public.listing_media lm
    join public.media m on m.id = lm.media_id
    where lm.listing_id = l.id
      and m.kind = 'photo'
      and m.moderation_status = 'approved'
      and m.rights->>'license' is not null
      and m.rights->>'granted_by' is not null
  )
  -- market coherence (belt over the composite-FK braces)
  and loc.market_id = l.market_id;

revoke all on public.publishable_locale_pages from public, anon, authenticated;
grant select on public.publishable_locale_pages to service_role;

-- ── 2. The permissioned gate ─────────────────────────────────────────────

create or replace function public.can_publish_listing_locale(
  p_listing_id uuid,
  p_locale text
)
returns table (blocker_code text, detail jsonb)
security definer
set search_path = public
language plpgsql
stable
as $$
declare
  v_listing public.listings%rowtype;
  v_location public.locations%rowtype;
  v_ll public.listing_locales%rowtype;
  v_org_market text;
  v_prov record;
  v_required_prov constant jsonb := '[
    {"target_table": "listings",  "field": "name",    "scope": "listing"},
    {"target_table": "locations", "field": "address", "scope": "location"},
    {"target_table": "locations", "field": "hours",   "scope": "location"}
  ]'::jsonb;
  v_req jsonb;
  v_target uuid;
begin
  if p_locale not in ('en', 'ja', 'ko') then
    raise exception 'unknown locale %', p_locale;
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'listing % not found', p_listing_id;
  end if;

  select * into v_location from public.locations where id = v_listing.location_id;
  select * into v_ll from public.listing_locales
    where listing_id = p_listing_id and locale = p_locale;

  -- missing_required_field ------------------------------------------------
  if v_ll.id is null or coalesce(v_ll.name, '') = '' then
    blocker_code := 'missing_required_field';
    detail := jsonb_build_object('field', 'name', 'locale', p_locale);
    return next;
  end if;
  if v_ll.id is null or v_ll.slug is null then
    blocker_code := 'missing_required_field';
    detail := jsonb_build_object('field', 'slug', 'locale', p_locale);
    return next;
  end if;
  if v_location.address is null then
    blocker_code := 'missing_required_field';
    detail := jsonb_build_object('field', 'address');
    return next;
  end if;
  if not exists (select 1 from public.hours_sets hs where hs.location_id = v_location.id) then
    blocker_code := 'missing_required_field';
    detail := jsonb_build_object('field', 'hours');
    return next;
  end if;
  if v_listing.primary_category_id is null then
    blocker_code := 'missing_required_field';
    detail := jsonb_build_object('field', 'primary_category');
    return next;
  end if;
  if not exists (
    select 1 from public.listing_media lm
    join public.media m on m.id = lm.media_id
    where lm.listing_id = p_listing_id and m.kind = 'photo'
  ) then
    blocker_code := 'missing_required_field';
    detail := jsonb_build_object('field', 'photo');
    return next;
  end if;

  -- locale_status_insufficient ---------------------------------------------
  if v_ll.id is null
     or v_ll.status not in ('qa_approved', 'vendor_approved', 'published') then
    blocker_code := 'locale_status_insufficient';
    detail := jsonb_build_object(
      'locale', p_locale,
      'status', coalesce(v_ll.status, 'not_started')
    );
    return next;
  end if;

  -- provenance_missing / provenance_expired ---------------------------------
  for v_req in select * from jsonb_array_elements(v_required_prov) loop
    v_target := case v_req->>'scope'
      when 'listing' then p_listing_id
      else v_location.id
    end;
    select * into v_prov
    from public.provenance p
    where p.target_table = v_req->>'target_table'
      and p.target_id = v_target
      and p.field = v_req->>'field'
      and p.is_current
      and p.approval_status = 'approved';
    if not found then
      blocker_code := 'provenance_missing';
      detail := jsonb_build_object(
        'target_table', v_req->>'target_table', 'field', v_req->>'field'
      );
      return next;
    elsif v_prov.expires_at is not null and v_prov.expires_at < now() then
      blocker_code := 'provenance_expired';
      detail := jsonb_build_object(
        'target_table', v_req->>'target_table', 'field', v_req->>'field',
        'expired_at', v_prov.expires_at
      );
      return next;
    end if;
  end loop;

  -- photo_rights_missing / photo_not_moderated ------------------------------
  for v_prov in
    select m.id as media_id, m.moderation_status, m.rights
    from public.listing_media lm
    join public.media m on m.id = lm.media_id
    where lm.listing_id = p_listing_id and m.kind = 'photo'
  loop
    if v_prov.rights is null
       or v_prov.rights->>'license' is null
       or v_prov.rights->>'granted_by' is null then
      blocker_code := 'photo_rights_missing';
      detail := jsonb_build_object('media_id', v_prov.media_id);
      return next;
    end if;
    if v_prov.moderation_status <> 'approved' then
      blocker_code := 'photo_not_moderated';
      detail := jsonb_build_object(
        'media_id', v_prov.media_id, 'status', v_prov.moderation_status
      );
      return next;
    end if;
  end loop;

  -- menu_evidence_missing / menu_rights_unlinked ----------------------------
  for v_prov in
    select mvl.id as mvl_id, mvl.status, mvl.approval_evidence_media_id,
           mvl.approved_by, mvl.approved_at,
           em.kind as evidence_kind,
           sm.rights as source_rights
    from public.menu_version_locales mvl
    join public.menu_versions mv on mv.id = mvl.menu_version_id
    join public.menu_documents md on md.id = mv.menu_document_id
    left join public.media em on em.id = mvl.approval_evidence_media_id
    join public.media sm on sm.id = md.source_media_id
    where md.listing_id = p_listing_id and mvl.locale = p_locale
      and mvl.status in ('approved', 'published')
  loop
    if v_prov.approval_evidence_media_id is null
       or v_prov.approved_by is null
       or v_prov.approved_at is null
       or v_prov.evidence_kind is distinct from 'evidence' then
      blocker_code := 'menu_evidence_missing';
      detail := jsonb_build_object('menu_version_locale_id', v_prov.mvl_id);
      return next;
    end if;
    if v_prov.source_rights is null
       or v_prov.source_rights->>'license' is null
       or v_prov.source_rights->>'granted_by' is null then
      blocker_code := 'menu_rights_unlinked';
      detail := jsonb_build_object('menu_version_locale_id', v_prov.mvl_id);
      return next;
    end if;
  end loop;

  -- category_integrity -------------------------------------------------------
  if v_listing.primary_category_id is not null then
    for v_prov in
      select c.id, c.active, c.publicly_visible, c.market_id as cat_market,
             cl.label, cl.slug as cat_slug,
             exists (
               select 1 from public.listing_categories lc
               where lc.listing_id = p_listing_id
                 and lc.category_id = v_listing.primary_category_id
             ) as attached
      from public.categories c
      left join public.category_locales cl
        on cl.category_id = c.id and cl.locale = p_locale
      where c.id = v_listing.primary_category_id
    loop
      if not v_prov.active
         or not v_prov.publicly_visible
         or coalesce(v_prov.label, '') = ''
         or coalesce(v_prov.cat_slug, '') = ''
         or not v_prov.attached
         or v_prov.cat_market <> v_listing.market_id then
        blocker_code := 'category_integrity';
        detail := jsonb_build_object(
          'category_id', v_prov.id,
          'active', v_prov.active,
          'publicly_visible', v_prov.publicly_visible,
          'locale_complete', coalesce(v_prov.label, '') <> '' and coalesce(v_prov.cat_slug, '') <> '',
          'attached', v_prov.attached,
          'market_match', v_prov.cat_market = v_listing.market_id
        );
        return next;
      end if;
    end loop;
  end if;

  -- market_mismatch -----------------------------------------------------------
  select o.market_id into v_org_market
  from public.organizations o where o.id = v_location.organization_id;

  if v_location.market_id <> v_listing.market_id then
    blocker_code := 'market_mismatch';
    detail := jsonb_build_object('entity', 'location', 'market_id', v_location.market_id);
    return next;
  end if;
  if v_org_market is not null and v_org_market <> v_listing.market_id then
    blocker_code := 'market_mismatch';
    detail := jsonb_build_object('entity', 'organization', 'market_id', v_org_market);
    return next;
  end if;
  for v_prov in
    select m.id as media_id, m.market_id as media_market
    from public.listing_media lm
    join public.media m on m.id = lm.media_id
    where lm.listing_id = p_listing_id and m.market_id <> v_listing.market_id
  loop
    blocker_code := 'market_mismatch';
    detail := jsonb_build_object('entity', 'media', 'media_id', v_prov.media_id);
    return next;
  end loop;

  return;
end;
$$;

revoke execute on function public.can_publish_listing_locale(uuid, text) from public, anon;
grant execute on function public.can_publish_listing_locale(uuid, text) to authenticated, service_role;

-- ── 3. Guarded transition functions ──────────────────────────────────────
-- Publication-critical mutations go ONLY through these (protects against
-- service-role scripts and console mistakes; the TS /lib/states guards are
-- the ergonomic layer on top).

create or replace function public.assert_publisher_aal2()
returns void
language plpgsql
stable
as $$
begin
  if not public.is_platform(array['publisher', 'super_admin']) then
    raise exception 'permission_denied: publish/unpublish requires publisher or super_admin';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: privileged mutation requires recent MFA';
  end if;
end;
$$;

create or replace function public.publish_listing_locale(
  p_listing_id uuid,
  p_locale text
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_blockers jsonb;
  v_ll public.listing_locales%rowtype;
  v_pub_status text;
begin
  perform public.assert_publisher_aal2();

  select coalesce(jsonb_agg(jsonb_build_object('code', blocker_code, 'detail', detail)), '[]'::jsonb)
  into v_blockers
  from public.can_publish_listing_locale(p_listing_id, p_locale);

  if v_blockers <> '[]'::jsonb then
    raise exception 'publication_blocked: %', v_blockers::text;
  end if;

  select * into v_ll from public.listing_locales
  where listing_id = p_listing_id and locale = p_locale
  for update;

  if v_ll.status not in ('qa_approved', 'vendor_approved') then
    raise exception
      'invalid_transition: listing_locale % cannot publish from status %',
      p_locale, v_ll.status;
  end if;

  select publication_status into v_pub_status
  from public.listings where id = p_listing_id for update;

  if v_pub_status = 'archived' then
    raise exception 'invalid_transition: archived listings cannot be published';
  end if;

  update public.listing_locales
  set status = 'published'
  where id = v_ll.id;

  if v_pub_status <> 'published' then
    update public.listings
    set publication_status = 'published'
    where id = p_listing_id;
  end if;

  insert into public.audit_log
    (actor, actor_source, action, target_table, target_id, after, request_id)
  values (
    auth.uid(), 'jwt', 'publish_listing_locale', 'listing_locales', v_ll.id::text,
    jsonb_build_object('listing_id', p_listing_id, 'locale', p_locale),
    nullif(current_setting('app.request_id', true), '')
  );
end;
$$;

create or replace function public.unpublish_listing_locale(
  p_listing_id uuid,
  p_locale text,
  p_reason text default null
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_ll public.listing_locales%rowtype;
  v_serving_remaining integer;
begin
  perform public.assert_publisher_aal2();

  select * into v_ll from public.listing_locales
  where listing_id = p_listing_id and locale = p_locale
  for update;

  if v_ll.id is null then
    raise exception 'listing_locale %/% not found', p_listing_id, p_locale;
  end if;

  if v_ll.status not in ('qa_approved', 'vendor_approved', 'published') then
    raise exception
      'invalid_transition: listing_locale % is not serving (status %)',
      p_locale, v_ll.status;
  end if;

  update public.listing_locales
  set status = 'withdrawn'
  where id = v_ll.id;

  select count(*) into v_serving_remaining
  from public.listing_locales
  where listing_id = p_listing_id
    and status in ('qa_approved', 'vendor_approved', 'published');

  if v_serving_remaining = 0 then
    update public.listings
    set publication_status = 'unpublished'
    where id = p_listing_id and publication_status = 'published';
  end if;

  insert into public.audit_log
    (actor, actor_source, action, target_table, target_id, after, request_id)
  values (
    auth.uid(), 'jwt', 'unpublish_listing_locale', 'listing_locales', v_ll.id::text,
    jsonb_build_object('listing_id', p_listing_id, 'locale', p_locale, 'reason', p_reason),
    nullif(current_setting('app.request_id', true), '')
  );
end;
$$;

-- Menu locale workflow transitions (PRD §6 state machine). Role rules:
--   → qa_pending:                editor/ops/publisher/super_admin
--   → qa_approved | rejected:    language_reviewer of THAT locale, or publisher+
--   → vendor_approval_pending:   editor/ops/publisher/super_admin
--   → approved:                  editor+ (privileged ⇒ aal2); external approval
--                                (D1) requires evidence params — the evidence
--                                constraint trigger enforces the payload
--   → published | superseded:    publisher/super_admin + aal2
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
  v_allowed boolean := false;
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
    v_allowed := public.is_platform(
      array['editor', 'ops_agent', 'publisher', 'super_admin']);
  elsif p_to_status in ('qa_approved', 'rejected') then
    -- language reviewers approve ONLY their own locale
    v_allowed := public.is_platform(array[v_reviewer_role])
      or (public.is_platform(array['publisher', 'super_admin'])
          and public.jwt_aal() = 'aal2');
  elsif p_to_status = 'approved' then
    v_allowed := public.is_platform(array['editor', 'publisher', 'super_admin'])
      and public.jwt_aal() = 'aal2';
    if v_allowed and coalesce(p_approval_type, '') = '' then
      raise exception 'approval_type required when approving (portal | vendor_approved_external)';
    end if;
  elsif p_to_status in ('published', 'superseded') then
    v_allowed := public.is_platform(array['publisher', 'super_admin'])
      and public.jwt_aal() = 'aal2';
  end if;

  if not v_allowed then
    raise exception
      'permission_denied: role/aal insufficient for menu transition to %', p_to_status;
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

revoke execute on function public.publish_listing_locale(uuid, text) from public, anon;
revoke execute on function public.unpublish_listing_locale(uuid, text, text) from public, anon;
revoke execute on function public.transition_menu_version_locale(uuid, text, text, uuid) from public, anon;
grant execute on function public.publish_listing_locale(uuid, text) to authenticated, service_role;
grant execute on function public.unpublish_listing_locale(uuid, text, text) to authenticated, service_role;
grant execute on function public.transition_menu_version_locale(uuid, text, text, uuid) to authenticated, service_role;
