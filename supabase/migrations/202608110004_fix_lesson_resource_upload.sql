-- Expand supported lesson file types and raise the private bucket limit.

update storage.buckets
set
  public = false,
  file_size_limit = 209715200,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a'
  ]
where id = 'lesson-resources';

-- Create the bucket if migration 001 did not create it.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
select
  'lesson-resources', 'lesson-resources', false, 209715200,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a'
  ]
where not exists (
  select 1 from storage.buckets where id = 'lesson-resources'
);

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'admins upload lesson files') then
    execute $policy$create policy "admins upload lesson files" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'lesson-resources' and public.has_role('admin'))$policy$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'admins update lesson files') then
    execute $policy$create policy "admins update lesson files" on storage.objects
      for update to authenticated
      using (bucket_id = 'lesson-resources' and public.has_role('admin'))$policy$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'admins delete lesson files') then
    execute $policy$create policy "admins delete lesson files" on storage.objects
      for delete to authenticated
      using (bucket_id = 'lesson-resources' and public.has_role('admin'))$policy$;
  end if;
end $$;
