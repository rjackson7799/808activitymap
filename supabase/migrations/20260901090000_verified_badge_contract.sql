-- D15 Verified Local badge contract. Publication remains independent: missing or
-- stale badge evidence suspends the badge but never auto-unpublishes a listing.

create or replace function public.provenance_allowed_fields(p_target_table text)
returns text[]
language sql
immutable
as $$
  select case p_target_table
    when 'listings' then array['name', 'price_band', 'attributes', 'primary_category']
    when 'locations' then array['address', 'phone', 'geo', 'hours', 'operational_status']
    when 'hours_sets' then array['weekly']
    when 'listing_locales' then array['name', 'editorial_note']
    when 'media' then array['rights']
    when 'menu_versions' then array['content']
    else array[]::text[]
  end;
$$;

-- Preserve the already-tested relational loader and wrap it with the complete badge
-- evidence set. The base remains private; callers retain the same public function name.
alter function public.load_permissioned_dossier(jsonb) rename to load_permissioned_dossier_v1;
revoke execute on function public.load_permissioned_dossier_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.load_permissioned_dossier(p_payload jsonb)
returns uuid
security definer
set search_path = public, storage
language plpgsql
as $$
declare
  v_listing uuid := (p_payload#>>'{ids,listing}')::uuid;
  v_location uuid := (p_payload#>>'{ids,location}')::uuid;
  v_confirmed boolean := coalesce((p_payload#>>'{verification,confirmed}')::boolean, false);
  v_evidence uuid := nullif(p_payload#>>'{verification,evidence_media_id}', '')::uuid;
  v_status text := case when v_confirmed then 'approved' else 'pending' end;
  v_supplied_by text := case when v_confirmed then 'vendor' else 'editor' end;
  v_source text := case when v_confirmed then 'in_person_visit' else 'website_draft' end;
  v_verified_at timestamptz := case
    when v_confirmed then (p_payload#>>'{verification,verified_at}')::timestamptz
    else now()
  end;
  v_expires_at timestamptz := case when v_confirmed then v_verified_at + interval '365 days' else null end;
  v_source_ref text := p_payload#>>'{source,website}';
  v_photo jsonb;
begin
  -- This call performs the role/AAL2 checks and all structural writes atomically.
  perform public.load_permissioned_dossier_v1(p_payload);

  perform public.upsert_provenance_evidenced(
    'listings', v_listing, 'primary_category', v_supplied_by, v_source, v_source_ref,
    v_verified_at, auth.uid(), v_status, v_expires_at,
    case when v_confirmed then v_evidence else null end
  );
  perform public.upsert_provenance_evidenced(
    'locations', v_location, 'geo', v_supplied_by, v_source, v_source_ref,
    v_verified_at, auth.uid(), v_status, v_expires_at,
    case when v_confirmed then v_evidence else null end
  );
  perform public.upsert_provenance_evidenced(
    'locations', v_location, 'phone', v_supplied_by, v_source, v_source_ref,
    v_verified_at, auth.uid(), v_status, v_expires_at,
    case when v_confirmed then v_evidence else null end
  );

  for v_photo in
    select * from jsonb_array_elements(coalesce(p_payload->'photos', '[]'::jsonb))
  loop
    perform public.upsert_provenance_evidenced(
      'media', (v_photo->>'id')::uuid, 'rights', v_supplied_by, v_source, v_source_ref,
      v_verified_at, auth.uid(), v_status, v_expires_at,
      case when v_confirmed then v_evidence else null end
    );
  end loop;

  return v_listing;
end;
$$;

revoke execute on function public.load_permissioned_dossier(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.load_permissioned_dossier(jsonb) to authenticated;

update public.app_config
set value = '{"badge_fields":["name","address","geo","phone","hours","photo","primary_category"],"suspend_on_stale":true}'::jsonb,
    description = 'Verified Local badge requires the complete D15 evidence set and suspends on stale facts'
where key = 'badge_freshness_rules';
