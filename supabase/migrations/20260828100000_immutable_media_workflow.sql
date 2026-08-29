-- Phase 0 staging hardening: immutable authenticated Storage objects plus an
-- audited, atomic listing-photo replacement workflow.
--
-- New bytes always use a fresh/versioned object key. Existing object keys may
-- still be read, but authenticated JWTs cannot overwrite or delete them.
-- Public URL construction remains unchanged because media.path is still the
-- path component below the public-photos bucket.

drop policy if exists "public photos staff update" on storage.objects;
drop policy if exists "public photos staff delete" on storage.objects;

-- ops_agent may upload metadata for moderation, but may never self-approve at
-- INSERT time. Privileged aal2 actors retain the existing ability to seed an
-- already-approved row; service/system ingestion remains available.
create or replace function public.enforce_media_insert_moderation()
returns trigger
set search_path = public
language plpgsql
as $$
begin
  if new.moderation_status <> 'pending'
     and auth.uid() is not null
     and not (
       public.is_platform(array['super_admin', 'publisher', 'editor'])
       and public.jwt_aal() = 'aal2'
     ) then
    raise exception 'permission_denied: uploaded media must begin pending';
  end if;
  return new;
end;
$$;

create trigger media_insert_moderation_guard
  before insert on public.media
  for each row execute function public.enforce_media_insert_moderation();

create or replace function public.replace_listing_photo(
  p_listing_id uuid,
  p_current_media_id uuid,
  p_new_media_id uuid
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_current public.listing_media%rowtype;
  v_new public.media%rowtype;
begin
  if not public.is_platform(array['super_admin', 'publisher', 'editor']) then
    raise exception 'permission_denied: photo replacement requires privileged staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: privileged mutation requires recent MFA';
  end if;
  if p_current_media_id = p_new_media_id then
    raise exception 'invalid_replacement: current and new media must differ';
  end if;

  select * into v_current
  from public.listing_media
  where listing_id = p_listing_id and media_id = p_current_media_id
  for update;
  if not found then
    raise exception 'stale_replacement: listing % is not attached to media %',
      p_listing_id, p_current_media_id;
  end if;

  select * into v_new
  from public.media
  where id = p_new_media_id
  for share;
  if not found then
    raise exception 'invalid_replacement: media % not found', p_new_media_id;
  end if;
  if v_new.market_id <> v_current.market_id then
    raise exception 'invalid_replacement: media market does not match listing attachment';
  end if;
  if v_new.bucket <> 'public-photos' or v_new.kind <> 'photo' then
    raise exception 'invalid_replacement: replacement must be a public photo';
  end if;
  if v_new.moderation_status <> 'approved' then
    raise exception 'invalid_replacement: replacement photo is not approved';
  end if;
  if v_new.rights is null
     or nullif(v_new.rights->>'license', '') is null
     or nullif(v_new.rights->>'granted_by', '') is null then
    raise exception 'invalid_replacement: replacement photo rights are incomplete';
  end if;
  if exists (
    select 1 from public.listing_media
    where listing_id = p_listing_id and media_id = p_new_media_id
  ) then
    raise exception 'invalid_replacement: replacement photo is already attached';
  end if;

  -- One row UPDATE preserves position+market_id and produces one same-
  -- transaction write_audit row containing the old/new media ids.
  update public.listing_media
  set media_id = p_new_media_id
  where listing_id = p_listing_id and media_id = p_current_media_id;
end;
$$;

revoke execute on function public.replace_listing_photo(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_listing_photo(uuid, uuid, uuid)
  to authenticated;
