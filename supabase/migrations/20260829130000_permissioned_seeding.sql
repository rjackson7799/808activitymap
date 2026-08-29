-- Phase 0 permissioned inventory loader. The public API accepts only a
-- normalized, deterministic dossier and remains guarded by publisher/super-
-- admin role + AAL2. Storage bytes are uploaded first under immutable hashes;
-- this function atomically creates or refreshes the relational draft.

alter table public.provenance
  add column source_ref text,
  add column evidence_media_id uuid references public.media (id) on delete restrict;

create or replace function public.provenance_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'provenance rows are never deleted (history is permanent)';
  end if;
  if old.is_current and not new.is_current
     and new.id = old.id
     and new.target_table = old.target_table
     and new.target_id = old.target_id
     and new.field = old.field
     and new.supplied_by = old.supplied_by
     and new.source_type is not distinct from old.source_type
     and new.source_ref is not distinct from old.source_ref
     and new.verified_at = old.verified_at
     and new.verified_by is not distinct from old.verified_by
     and new.confidence is not distinct from old.confidence
     and new.approval_status = old.approval_status
     and new.expires_at is not distinct from old.expires_at
     and new.evidence_media_id is not distinct from old.evidence_media_id
     and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'provenance rows are immutable except the supersede flip (is_current true→false)';
end;
$$;

create or replace function public.upsert_provenance_evidenced(
  p_target_table text,
  p_target_id uuid,
  p_field text,
  p_supplied_by text,
  p_source_type text,
  p_source_ref text,
  p_verified_at timestamptz,
  p_verified_by uuid,
  p_approval_status text,
  p_expires_at timestamptz,
  p_evidence_media_id uuid
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare v_new_id uuid;
begin
  if p_field <> all (public.provenance_allowed_fields(p_target_table))
     and array_length(public.provenance_allowed_fields(p_target_table), 1) is not null then
    raise exception 'provenance field "%" is not allowlisted for table "%"', p_field, p_target_table;
  end if;
  if array_length(public.provenance_allowed_fields(p_target_table), 1) is null then
    raise exception 'provenance target_table "%" is not allowlisted', p_target_table;
  end if;
  if p_evidence_media_id is not null and not exists (
    select 1 from public.media
    where id = p_evidence_media_id and bucket = 'evidence' and kind = 'evidence'
  ) then
    raise exception 'invalid provenance evidence media %', p_evidence_media_id;
  end if;
  update public.provenance set is_current = false
  where target_table = p_target_table and target_id = p_target_id and field = p_field and is_current;
  insert into public.provenance
    (target_table, target_id, field, supplied_by, source_type, source_ref, verified_at, verified_by,
     approval_status, expires_at, evidence_media_id)
  values
    (p_target_table, p_target_id, p_field, p_supplied_by, p_source_type, p_source_ref, p_verified_at,
     p_verified_by, p_approval_status, p_expires_at, p_evidence_media_id)
  returning id into v_new_id;
  return v_new_id;
end;
$$;

revoke execute on function public.upsert_provenance_evidenced(text, uuid, text, text, text, text, timestamptz, uuid, text, timestamptz, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.load_permissioned_dossier(p_payload jsonb)
returns uuid
security definer
set search_path = public, storage
language plpgsql
as $$
declare
  v_org uuid := (p_payload#>>'{ids,organization}')::uuid;
  v_location uuid := (p_payload#>>'{ids,location}')::uuid;
  v_hours uuid := (p_payload#>>'{ids,hours}')::uuid;
  v_listing uuid := (p_payload#>>'{ids,listing}')::uuid;
  v_primary uuid := (p_payload#>>'{category,primary_id}')::uuid;
  v_confirmed boolean := coalesce((p_payload#>>'{verification,confirmed}')::boolean, false);
  v_evidence uuid := nullif(p_payload#>>'{verification,evidence_media_id}', '')::uuid;
  v_evidence_path text := p_payload#>>'{verification,evidence_path}';
  v_status text := case when v_confirmed then 'approved' else 'pending' end;
  v_source text := case when v_confirmed then 'in_person_visit' else 'website_draft' end;
  v_verified_at timestamptz := case when v_confirmed then (p_payload#>>'{verification,verified_at}')::timestamptz else now() end;
  v_photo jsonb;
  v_category text;
  v_locale_status text;
begin
  if not public.is_platform(array['publisher', 'super_admin']) then
    raise exception 'permission_denied: dossier loading requires publisher or super_admin';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: dossier loading requires recent MFA';
  end if;
  if nullif(p_payload->>'external_ref', '') is null then
    raise exception 'invalid_dossier: external_ref is required';
  end if;
  if v_confirmed and (v_evidence is null or nullif(v_evidence_path, '') is null) then
    raise exception 'invalid_dossier: confirmed verification requires permission evidence';
  end if;
  if v_verified_at > now() + interval '5 minutes' then
    raise exception 'invalid_dossier: verified_at cannot be in the future';
  end if;

  insert into public.organizations (id, name, legal_name)
  values (v_org, p_payload#>>'{organization,name}', p_payload#>>'{organization,legal_name}')
  on conflict (id) do update set name = excluded.name, legal_name = excluded.legal_name;

  insert into public.locations (id, organization_id, address, geo_lat, geo_lng, phone)
  values (v_location, v_org, p_payload#>'{location,address}',
    (p_payload#>>'{location,geo_lat}')::numeric, (p_payload#>>'{location,geo_lng}')::numeric,
    p_payload#>>'{location,phone}')
  on conflict (id) do update set address = excluded.address, geo_lat = excluded.geo_lat,
    geo_lng = excluded.geo_lng, phone = excluded.phone;

  insert into public.hours_sets (id, location_id, weekly)
  values (v_hours, v_location, p_payload->'hours')
  on conflict (location_id) do update set weekly = excluded.weekly;

  insert into public.listings (id, location_id)
  values (v_listing, v_location)
  on conflict (id) do nothing;

  insert into public.listing_categories (listing_id, category_id)
  values (v_listing, v_primary) on conflict do nothing;
  for v_category in select jsonb_array_elements_text(coalesce(p_payload#>'{category,secondary_ids}', '[]'::jsonb)) loop
    insert into public.listing_categories (listing_id, category_id)
    values (v_listing, v_category::uuid) on conflict do nothing;
  end loop;
  update public.listings set primary_category_id = v_primary where id = v_listing;

  insert into public.listing_locales
    (listing_id, locale, name, slug, seo_title, seo_desc, editorial_note)
  values (v_listing, 'en', p_payload#>>'{locale,name}', p_payload#>>'{locale,slug}',
    p_payload#>>'{locale,seo_title}', p_payload#>>'{locale,seo_desc}', p_payload#>>'{locale,editorial_note}')
  on conflict (listing_id, locale) do update set name = excluded.name, slug = excluded.slug,
    seo_title = excluded.seo_title, seo_desc = excluded.seo_desc, editorial_note = excluded.editorial_note;

  select status into v_locale_status from public.listing_locales where listing_id = v_listing and locale = 'en';
  if v_locale_status = 'not_started' then
    perform public.transition_listing_locale(v_listing, 'en', 'qa_pending');
  end if;

  if v_confirmed then
    if not exists (select 1 from storage.objects where bucket_id = 'evidence' and name = v_evidence_path) then
      raise exception 'invalid_dossier: permission-form Storage object is missing';
    end if;
    insert into public.media (id, bucket, path, kind, rights, moderation_status, uploaded_by)
    values (v_evidence, 'evidence', v_evidence_path, 'evidence',
      jsonb_build_object('license', 'content_permission', 'granted_by', p_payload#>>'{verification,granted_by}'),
      'approved', auth.uid())
    on conflict (id) do update set rights = excluded.rights, moderation_status = 'approved';
  end if;

  for v_photo in select * from jsonb_array_elements(coalesce(p_payload->'photos', '[]'::jsonb)) loop
    if not exists (select 1 from storage.objects where bucket_id = 'public-photos' and name = v_photo->>'path') then
      raise exception 'invalid_dossier: photo Storage object is missing: %', v_photo->>'path';
    end if;
    insert into public.media (id, bucket, path, kind, rights, moderation_status, uploaded_by)
    values ((v_photo->>'id')::uuid, 'public-photos', v_photo->>'path', 'photo',
      jsonb_build_object('license', v_photo->>'license', 'granted_by', v_photo->>'granted_by'),
      case when v_confirmed then 'approved' else 'pending' end, auth.uid())
    on conflict (id) do update set rights = excluded.rights,
      moderation_status = case when v_confirmed then 'approved' else public.media.moderation_status end;
    insert into public.listing_media (listing_id, media_id, position)
    values (v_listing, (v_photo->>'id')::uuid, coalesce((v_photo->>'position')::integer, 0)) on conflict do nothing;
    insert into public.media_locales (media_id, locale, alt_text)
    values ((v_photo->>'id')::uuid, 'en', v_photo->>'alt')
    on conflict (media_id, locale) do update set alt_text = excluded.alt_text;
  end loop;

  if v_confirmed then
    perform public.upsert_provenance_evidenced('listings', v_listing, 'name', 'vendor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, v_verified_at + interval '365 days', v_evidence);
    perform public.upsert_provenance_evidenced('locations', v_location, 'address', 'vendor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, v_verified_at + interval '365 days', v_evidence);
    perform public.upsert_provenance_evidenced('locations', v_location, 'hours', 'vendor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, v_verified_at + interval '90 days', v_evidence);
    perform public.upsert_provenance_evidenced('listing_locales', (select id from public.listing_locales where listing_id=v_listing and locale='en'), 'name', 'vendor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, v_verified_at + interval '365 days', v_evidence);
    perform public.upsert_provenance_evidenced('listing_locales', (select id from public.listing_locales where listing_id=v_listing and locale='en'), 'editorial_note', 'editor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, v_verified_at + interval '365 days', v_evidence);
  else
    perform public.upsert_provenance_evidenced('listings', v_listing, 'name', 'editor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, null, null);
    perform public.upsert_provenance_evidenced('locations', v_location, 'address', 'editor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, null, null);
    perform public.upsert_provenance_evidenced('locations', v_location, 'hours', 'editor', v_source, p_payload#>>'{source,website}', v_verified_at, auth.uid(), v_status, null, null);
  end if;

  return v_listing;
end;
$$;

revoke execute on function public.load_permissioned_dossier(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.load_permissioned_dossier(jsonb) to authenticated;
