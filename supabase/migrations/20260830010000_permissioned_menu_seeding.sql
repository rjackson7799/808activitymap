-- Deterministic, permissioned Phase 0 menu intake. Source bytes and vendor
-- approval evidence are immutable Storage objects uploaded before this
-- atomic relational load. Money is stored once; every served locale must
-- provide complete, human-confirmed labels and descriptions of its own.

alter table public.menu_versions add column seed_hash text;

create or replace function public.check_menu_locale_completeness()
returns trigger
language plpgsql
as $$
begin
  if new.status not in ('qa_approved', 'approved', 'published') then return null; end if;
  -- Legacy/manual menu rows predate dossier confirmation metadata. Keep their
  -- established workflow intact; dossier-loaded versions are always strict.
  if not exists (
    select 1 from public.menu_versions mv
    where mv.id = new.menu_version_id and mv.seed_hash is not null
  ) then return null; end if;
  if exists (
    select 1 from public.menu_sections s
    where s.menu_version_id = new.menu_version_id
      and not exists (select 1 from public.menu_section_locales sl where sl.section_id=s.id and sl.locale=new.locale and nullif(btrim(sl.name),'') is not null)
  ) then raise exception 'menu_locale_incomplete: every section requires a % name', new.locale; end if;
  if exists (
    select 1 from public.menu_items i join public.menu_sections s on s.id=i.section_id
    where s.menu_version_id = new.menu_version_id
      and not exists (
        select 1 from public.menu_item_locales il where il.item_id=i.id and il.locale=new.locale
          and nullif(btrim(il.name),'') is not null and il.human_confirmed
      )
  ) then raise exception 'menu_locale_incomplete: every item requires a human-confirmed % name', new.locale; end if;
  return null;
end;
$$;

create constraint trigger menu_version_locales_completeness_guard
after insert or update on public.menu_version_locales
deferrable initially immediate for each row execute function public.check_menu_locale_completeness();

create or replace function public.activate_published_menu_version()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    update public.menu_versions set status='superseded'
    where menu_document_id=(select menu_document_id from public.menu_versions where id=new.menu_version_id)
      and id<>new.menu_version_id and status='active';
    update public.menu_versions set status='active' where id=new.menu_version_id;
  end if;
  return null;
end;
$$;
create trigger menu_version_locale_activate after update on public.menu_version_locales
for each row execute function public.activate_published_menu_version();

create or replace function public.can_publish_menu_locale(p_id uuid)
returns table (blocker_code text, detail jsonb)
security definer set search_path=public language plpgsql stable as $$
declare v public.menu_version_locales%rowtype;
begin
  select * into v from public.menu_version_locales where id=p_id;
  if v.id is null then raise exception 'menu_version_locale % not found', p_id; end if;
  if v.status not in ('approved','published') then blocker_code:='locale_status_insufficient'; detail:=jsonb_build_object('status',v.status); return next; end if;
  if v.approval_evidence_media_id is null or v.approved_by is null or v.approved_at is null
     or not exists(select 1 from public.media where id=v.approval_evidence_media_id and kind='evidence' and moderation_status='approved') then
    blocker_code:='menu_evidence_missing'; detail:=jsonb_build_object('menu_version_locale_id',p_id); return next;
  end if;
  if exists(select 1 from public.menu_sections s where s.menu_version_id=v.menu_version_id and not exists(select 1 from public.menu_section_locales sl where sl.section_id=s.id and sl.locale=v.locale and nullif(btrim(sl.name),'') is not null))
     or exists(select 1 from public.menu_items i join public.menu_sections s on s.id=i.section_id where s.menu_version_id=v.menu_version_id and not exists(select 1 from public.menu_item_locales il where il.item_id=i.id and il.locale=v.locale and nullif(btrim(il.name),'') is not null and il.human_confirmed)) then
    blocker_code:='menu_locale_incomplete'; detail:=jsonb_build_object('locale',v.locale); return next;
  end if;
  if not exists(
    select 1 from public.menu_versions mv join public.menu_documents md on md.id=mv.menu_document_id join public.media m on m.id=md.source_media_id
    where mv.id=v.menu_version_id and m.kind='menu_source' and m.moderation_status='approved' and m.rights->>'license' is not null and m.rights->>'granted_by' is not null
  ) then blocker_code:='menu_rights_unlinked'; detail:=jsonb_build_object('menu_version_locale_id',p_id); return next; end if;
  return;
end;
$$;
revoke execute on function public.can_publish_menu_locale(uuid) from public, anon;
grant execute on function public.can_publish_menu_locale(uuid) to authenticated, service_role;

create or replace function public.load_permissioned_menu_dossier(p_payload jsonb)
returns uuid security definer set search_path=public,storage language plpgsql as $$
declare
  v_listing uuid := (p_payload#>>'{ids,listing}')::uuid;
  v_document uuid := (p_payload#>>'{ids,document}')::uuid;
  v_version uuid := (p_payload#>>'{ids,version}')::uuid;
  v_source uuid := (p_payload#>>'{source,id}')::uuid;
  v_evidence uuid := (p_payload#>>'{approval,id}')::uuid;
  v_hash text := p_payload->>'seed_hash';
  v_version_number integer := (p_payload->>'version')::integer;
  v_existing_hash text;
  v_existing_document uuid;
  v_existing_version_number integer;
  v_section jsonb; v_item jsonb; v_locale record; v_ls jsonb; v_li jsonb;
  v_section_id uuid; v_item_id uuid;
begin
  if not public.is_platform(array['publisher','super_admin']) then raise exception 'permission_denied: menu loading requires publisher or super_admin'; end if;
  if public.jwt_aal() is distinct from 'aal2' then raise exception 'aal2_required: menu loading requires recent MFA'; end if;
  if not exists(select 1 from public.listings where id=v_listing) then raise exception 'listing % not found',v_listing; end if;
  if not exists(select 1 from public.provenance where target_table='listings' and target_id=v_listing and field='name' and is_current and approval_status='approved') then raise exception 'permissioned_source_not_confirmed: approved listing provenance is required'; end if;
  if not exists(select 1 from storage.objects where bucket_id='menu-sources' and name=p_payload#>>'{source,path}') then raise exception 'invalid_menu: source Storage object is missing'; end if;
  if not exists(select 1 from storage.objects where bucket_id='evidence' and name=p_payload#>>'{approval,path}') then raise exception 'invalid_menu: approval evidence Storage object is missing'; end if;
  if v_version_number is null or v_version_number < 1 then raise exception 'invalid_menu: version must be at least 1'; end if;
  if exists(select 1 from public.media where id=v_source and (bucket<>'menu-sources' or path<>p_payload#>>'{source,path}' or kind<>'menu_source')) then raise exception 'menu_id_collision: source media id belongs to another object'; end if;
  if exists(select 1 from public.media where id=v_evidence and (bucket<>'evidence' or path<>p_payload#>>'{approval,path}' or kind<>'evidence')) then raise exception 'menu_id_collision: evidence media id belongs to another object'; end if;
  if exists(select 1 from public.menu_documents where id=v_document and (listing_id<>v_listing or source_media_id<>v_source)) then raise exception 'menu_id_collision: document id belongs to another listing or source; use a new menu_ref for a different source capture'; end if;

  select seed_hash,menu_document_id,version into v_existing_hash,v_existing_document,v_existing_version_number from public.menu_versions where id=v_version;
  if found and (v_existing_document<>v_document or v_existing_version_number<>v_version_number or v_existing_hash is null) then raise exception 'menu_id_collision: version id belongs to another menu version'; end if;
  if found and v_existing_hash=v_hash then return v_version; end if;
  if found and exists(select 1 from public.menu_version_locales where menu_version_id=v_version and status<>'translation_pending') then raise exception 'menu_locked_for_review: create a new version instead of overwriting reviewed content'; end if;

  insert into public.media(id,bucket,path,kind,rights,moderation_status,uploaded_by) values
    (v_source,'menu-sources',p_payload#>>'{source,path}','menu_source',jsonb_build_object('license',p_payload#>>'{source,license}','granted_by',p_payload#>>'{source,granted_by}'),'approved',auth.uid()) on conflict(id) do nothing;
  insert into public.media(id,bucket,path,kind,rights,moderation_status,uploaded_by) values
    (v_evidence,'evidence',p_payload#>>'{approval,path}','evidence',jsonb_build_object('license',p_payload#>>'{approval,license}','granted_by',p_payload#>>'{approval,granted_by}'),'approved',auth.uid()) on conflict(id) do nothing;
  insert into public.menu_documents(id,listing_id,source_media_id,captured_at,captured_by) values
    (v_document,v_listing,v_source,(p_payload#>>'{source,captured_at}')::timestamptz,auth.uid()) on conflict(id) do nothing;
  insert into public.menu_versions(id,menu_document_id,version,status,seed_hash) values(v_version,v_document,v_version_number,'draft',v_hash)
    on conflict(id) do update set seed_hash=excluded.seed_hash;
  delete from public.menu_sections where menu_version_id=v_version;
  delete from public.menu_version_locales where menu_version_id=v_version;

  for v_section in select * from jsonb_array_elements(p_payload->'sections') loop
    v_section_id := (v_section->>'id')::uuid;
    insert into public.menu_sections(id,menu_version_id,position) values(v_section_id,v_version,(v_section->>'position')::int);
    for v_item in select * from jsonb_array_elements(v_section->'items') loop
      insert into public.menu_items(id,section_id,position,price_cents,currency,price_type,variant,flags,owner_pick) values
        ((v_item->>'id')::uuid,v_section_id,(v_item->>'position')::int,nullif(v_item->>'price_cents','')::int,coalesce(v_item->>'currency','USD'),coalesce(v_item->>'price_type','fixed'),v_item->>'variant',coalesce(v_item->'flags','{}'::jsonb),coalesce((v_item->>'owner_pick')::boolean,false));
    end loop;
  end loop;
  for v_locale in select * from jsonb_each(p_payload->'locales') loop
    insert into public.menu_version_locales(id,menu_version_id,locale,status) values((p_payload#>>array['ids','locales',v_locale.key])::uuid,v_version,v_locale.key,'translation_pending');
    for v_ls in select * from jsonb_array_elements(v_locale.value->'sections') loop
      select (s->>'id')::uuid into v_section_id from jsonb_array_elements(p_payload->'sections') s where s->>'ref'=v_ls->>'ref';
      insert into public.menu_section_locales(section_id,locale,name) values(v_section_id,v_locale.key,v_ls->>'name');
      for v_li in select * from jsonb_array_elements(v_ls->'items') loop
        select (i->>'id')::uuid into v_item_id from jsonb_array_elements(p_payload->'sections') s cross join lateral jsonb_array_elements(s->'items') i where i->>'ref'=v_li->>'ref';
        insert into public.menu_item_locales(item_id,locale,original_name,transliteration,name,description,extraction_confidence,human_confirmed) values
          (v_item_id,v_locale.key,v_li->>'original_name',v_li->>'transliteration',v_li->>'name',v_li->>'description',nullif(v_li->>'extraction_confidence','')::numeric,coalesce((v_li->>'human_confirmed')::boolean,false));
      end loop;
    end loop;
  end loop;
  return v_version;
end;
$$;
revoke execute on function public.load_permissioned_menu_dossier(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.load_permissioned_menu_dossier(jsonb) to authenticated;
