-- Extend the guarded permissioned locale staging function to Korean.
-- Both translated locales remain non-serving machine drafts until their
-- existing locale-specific QA and publication contracts are satisfied.

create or replace function public.stage_permissioned_listing_locale(
  p_listing_id uuid,
  p_locale text,
  p_content jsonb
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_row public.listing_locales%rowtype;
  v_name text := nullif(btrim(p_content->>'name'), '');
  v_slug text := nullif(btrim(p_content->>'slug'), '');
  v_seo_title text := nullif(btrim(p_content->>'seo_title'), '');
  v_seo_desc text := nullif(btrim(p_content->>'seo_desc'), '');
  v_editorial_note text := nullif(btrim(p_content->>'editorial_note'), '');
begin
  if p_locale not in ('ja', 'ko') then
    raise exception 'unsupported_locale: permissioned follow-on supports ja and ko only';
  end if;
  if not public.is_platform(array['publisher', 'super_admin']) then
    raise exception 'permission_denied: locale staging requires publisher or super_admin';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: locale staging requires recent MFA';
  end if;
  if v_name is null or v_slug is null or v_seo_title is null
     or v_seo_desc is null or v_editorial_note is null then
    raise exception 'invalid_locale: name, slug, seo_title, seo_desc, and editorial_note are required';
  end if;
  if not exists (select 1 from public.listings where id = p_listing_id) then
    raise exception 'listing % not found', p_listing_id;
  end if;
  if not exists (
    select 1 from public.provenance
    where target_table = 'listings' and target_id = p_listing_id
      and field = 'name' and is_current and approval_status = 'approved'
  ) then
    raise exception 'permissioned_source_not_confirmed: approved listing provenance is required';
  end if;

  select * into v_row from public.listing_locales
  where listing_id = p_listing_id and locale = p_locale
  for update;

  if found and v_row.status not in ('not_started', 'machine_draft') then
    if v_row.name is not distinct from v_name
       and v_row.slug is not distinct from v_slug
       and v_row.seo_title is not distinct from v_seo_title
       and v_row.seo_desc is not distinct from v_seo_desc
       and v_row.editorial_note is not distinct from v_editorial_note then
      return v_row.id;
    end if;
    raise exception 'locale_locked_for_review: create a reviewed revision instead of overwriting % content', v_row.status;
  end if;

  if found then
    update public.listing_locales
    set name = v_name, slug = v_slug, seo_title = v_seo_title,
        seo_desc = v_seo_desc, editorial_note = v_editorial_note
    where id = v_row.id;
  else
    insert into public.listing_locales
      (listing_id, locale, name, slug, seo_title, seo_desc, editorial_note)
    values
      (p_listing_id, p_locale, v_name, v_slug, v_seo_title, v_seo_desc, v_editorial_note)
    returning * into v_row;
  end if;

  if v_row.status = 'not_started' then
    perform public.transition_listing_locale(p_listing_id, p_locale, 'machine_draft');
  end if;
  return v_row.id;
end;
$$;

revoke execute on function public.stage_permissioned_listing_locale(uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.stage_permissioned_listing_locale(uuid, text, jsonb)
  to authenticated;
