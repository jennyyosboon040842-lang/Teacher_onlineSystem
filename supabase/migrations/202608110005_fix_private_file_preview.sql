-- Ensure Admin can issue signed URLs for private lesson resources.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admins read lesson files'
  ) then
    execute $policy$
      create policy "admins read lesson files"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'lesson-resources'
        and public.has_role('admin')
      )
    $policy$;
  end if;
end $$;

-- Ensure lesson resource metadata is readable by Admin independently of
-- policies used by teachers and students.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lesson_resources'
      and policyname = 'admins read lesson resource metadata'
  ) then
    execute $policy$
      create policy "admins read lesson resource metadata"
      on public.lesson_resources for select to authenticated
      using (public.has_role('admin'))
    $policy$;
  end if;
end $$;

-- Diagnostic query (returns orphan metadata whose object is missing).
create or replace view public.lesson_resource_storage_health
with (security_invoker = true)
as
select
  r.id as resource_id,
  r.title,
  r.storage_path,
  (o.name is not null) as object_exists
from public.lesson_resources r
left join storage.objects o
  on o.bucket_id = 'lesson-resources'
 and o.name = r.storage_path;

grant select on public.lesson_resource_storage_health to authenticated;
