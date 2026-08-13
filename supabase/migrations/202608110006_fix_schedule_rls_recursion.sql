-- Break the circular RLS dependency between class_sessions and
-- class_session_students. Security-definer helpers read membership without
-- invoking the other table's policy again.

create or replace function public.is_session_student(
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_session_students
    where session_id = target_session_id
      and student_id = auth.uid()
  );
$$;

create or replace function public.is_session_teacher(
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_sessions
    where id = target_session_id
      and teacher_id = auth.uid()
  );
$$;

revoke all on function public.is_session_student(uuid) from public;
revoke all on function public.is_session_teacher(uuid) from public;
grant execute on function public.is_session_student(uuid) to authenticated;
grant execute on function public.is_session_teacher(uuid) to authenticated;

drop policy if exists "students read assigned sessions" on public.class_sessions;
create policy "students read assigned sessions" on public.class_sessions
for select to authenticated using (
  public.has_role('student') and public.is_session_student(id)
);

drop policy if exists "teachers read students in own sessions" on public.class_session_students;
create policy "teachers read students in own sessions" on public.class_session_students
for select to authenticated using (
  public.has_role('teacher') and public.is_session_teacher(session_id)
);
