-- Allow Admin to remove a teacher from a future/unsubmitted class session.

alter table public.class_sessions
  alter column teacher_id drop not null;

create or replace function public.unassign_teacher_from_session(
  target_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then raise exception 'permission_denied'; end if;
  if exists (
    select 1 from public.teacher_hour_entries
    where session_id = target_session_id
  ) then
    raise exception 'session_has_teaching_record';
  end if;

  update public.class_sessions
  set teacher_id = null
  where id = target_session_id;

  if not found then raise exception 'session_not_found'; end if;
end;
$$;

revoke all on function public.unassign_teacher_from_session(uuid) from public;
grant execute on function public.unassign_teacher_from_session(uuid) to authenticated;

notify pgrst, 'reload schema';
