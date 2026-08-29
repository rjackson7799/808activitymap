-- Follow-up guards for the immutable media workflow. This remains separate
-- because the preceding migration was already applied to the local database;
-- database history is forward-only even during hardening.

-- A media row's identity is immutable. Moderation and rights may be updated
-- (and are audited), but changing bucket/path/kind/market/upload attribution
-- would repoint already-approved metadata to different bytes.
create or replace function public.enforce_media_identity_immutable()
returns trigger
set search_path = public
language plpgsql
as $$
begin
  if new.bucket is distinct from old.bucket
     or new.path is distinct from old.path
     or new.kind is distinct from old.kind
     or new.market_id is distinct from old.market_id
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'immutable_media_identity: create a new versioned media row';
  end if;
  return new;
end;
$$;

create trigger media_identity_immutable
  before update on public.media
  for each row execute function public.enforce_media_identity_immutable();

-- Replace the function with the same role/state checks plus proof that the
-- approved metadata points at an existing immutable Storage object.
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
  if not exists (
    select 1 from storage.objects
    where bucket_id = v_new.bucket and name = v_new.path
  ) then
    raise exception 'invalid_replacement: replacement Storage object is missing';
  end if;
  if exists (
    select 1 from public.listing_media
    where listing_id = p_listing_id and media_id = p_new_media_id
  ) then
    raise exception 'invalid_replacement: replacement photo is already attached';
  end if;

  update public.listing_media
  set media_id = p_new_media_id
  where listing_id = p_listing_id and media_id = p_current_media_id;
end;
$$;
