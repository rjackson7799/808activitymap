-- Phase 0 staging hardening: enforce the PRD's aal2 requirement at the
-- direct Supabase Storage authorization boundary.
--
-- ops_agent retains the existing Storage mutation behavior only when the JWT
-- does not also carry a privileged platform role. A mixed privileged+ops JWT
-- must satisfy aal2; otherwise the ops branch would remain an MFA bypass.

drop policy if exists "public photos staff insert" on storage.objects;
drop policy if exists "public photos staff update" on storage.objects;
drop policy if exists "public photos staff delete" on storage.objects;
drop policy if exists "menu sources staff insert" on storage.objects;
drop policy if exists "evidence staff insert" on storage.objects;

create policy "public photos staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'public-photos'
    and (
      (
        (select public.is_platform(array['super_admin', 'publisher', 'editor']))
        and (select public.jwt_aal()) = 'aal2'
      )
      or (
        (select public.is_platform(array['ops_agent']))
        and not (select public.is_platform(array['super_admin', 'publisher', 'editor']))
      )
    )
  );

create policy "public photos staff update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'public-photos'
    and (
      (
        (select public.is_platform(array['super_admin', 'publisher', 'editor']))
        and (select public.jwt_aal()) = 'aal2'
      )
      or (
        (select public.is_platform(array['ops_agent']))
        and not (select public.is_platform(array['super_admin', 'publisher', 'editor']))
      )
    )
  )
  with check (
    bucket_id = 'public-photos'
    and (
      (
        (select public.is_platform(array['super_admin', 'publisher', 'editor']))
        and (select public.jwt_aal()) = 'aal2'
      )
      or (
        (select public.is_platform(array['ops_agent']))
        and not (select public.is_platform(array['super_admin', 'publisher', 'editor']))
      )
    )
  );

create policy "public photos staff delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'public-photos'
    and (
      (
        (select public.is_platform(array['super_admin', 'publisher', 'editor']))
        and (select public.jwt_aal()) = 'aal2'
      )
      or (
        (select public.is_platform(array['ops_agent']))
        and not (select public.is_platform(array['super_admin', 'publisher', 'editor']))
      )
    )
  );

create policy "menu sources staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-sources'
    and (
      (
        (select public.is_platform(array['super_admin', 'publisher', 'editor']))
        and (select public.jwt_aal()) = 'aal2'
      )
      or (
        (select public.is_platform(array['ops_agent']))
        and not (select public.is_platform(array['super_admin', 'publisher', 'editor']))
      )
    )
  );

create policy "evidence staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and (select public.is_platform(array['super_admin', 'publisher', 'editor']))
    and (select public.jwt_aal()) = 'aal2'
  );
