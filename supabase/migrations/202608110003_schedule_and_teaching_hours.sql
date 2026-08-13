-- Class schedules, Meet access and daily teacher completion approval.

do $$ begin
  create type public.class_status as enum (
    'draft', 'confirmed', 'completed', 'cancelled',
    'rescheduled', 'teacher_leave', 'student_absent'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.teaching_hour_status as enum (
    'draft', 'submitted', 'approved', 'rejected', 'reversed'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  level_id uuid references public.course_levels(id),
  lesson_id uuid references public.lessons(id),
  teacher_id uuid not null references public.teacher_profiles(user_id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_hours numeric(8,2) generated always as (
    extract(epoch from (ends_at - starts_at)) / 3600
  ) stored,
  status public.class_status not null default 'confirmed',
  meet_url text,
  meet_visible_from timestamptz,
  meet_visible_until timestamptz,
  completion_notes text,
  completed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (meet_url is null or meet_url ~ '^https://')
);

create table if not exists public.class_session_students (
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.student_profiles(user_id) on delete cascade,
  attendance_status text not null default 'scheduled'
    check (attendance_status in ('scheduled','present','absent','cancelled')),
  hours_to_deduct numeric(8,2) not null default 0 check (hours_to_deduct >= 0),
  joined_at timestamptz,
  left_at timestamptz,
  note text,
  primary key (session_id, student_id)
);

create table if not exists public.teacher_hour_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.class_sessions(id),
  teacher_id uuid not null references public.teacher_profiles(user_id),
  teaching_date date not null,
  hours_taught numeric(8,2) not null check (hours_taught > 0),
  status public.teaching_hour_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null default auth.uid() references public.profiles(id),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  rejected_at timestamptz,
  rejected_by uuid references public.profiles(id),
  rejection_reason text,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_at is not null and approved_by is not null)),
  check (status <> 'rejected' or (rejected_at is not null and rejected_by is not null and rejection_reason is not null))
);

create index if not exists idx_sessions_teacher_time
  on public.class_sessions (teacher_id, starts_at);
create index if not exists idx_session_students_student
  on public.class_session_students (student_id, session_id);
create index if not exists idx_teacher_hours_daily_pending
  on public.teacher_hour_entries (teaching_date, status)
  where status = 'submitted';

drop trigger if exists class_sessions_updated_at on public.class_sessions;
create trigger class_sessions_updated_at before update on public.class_sessions
for each row execute function public.set_updated_at();
drop trigger if exists teacher_hours_updated_at on public.teacher_hour_entries;
create trigger teacher_hours_updated_at before update on public.teacher_hour_entries
for each row execute function public.set_updated_at();

alter table public.class_sessions enable row level security;
alter table public.class_session_students enable row level security;
alter table public.teacher_hour_entries enable row level security;

create policy "admins manage class sessions" on public.class_sessions
for all to authenticated using (public.has_role('admin'))
with check (public.has_role('admin'));

create policy "teachers read own sessions" on public.class_sessions
for select to authenticated using (
  public.has_role('teacher') and teacher_id = auth.uid()
);

create policy "students read assigned sessions" on public.class_sessions
for select to authenticated using (
  public.has_role('student') and exists (
    select 1 from public.class_session_students css
    where css.session_id = id and css.student_id = auth.uid()
  )
);

create policy "admins manage session students" on public.class_session_students
for all to authenticated using (public.has_role('admin'))
with check (public.has_role('admin'));
create policy "teachers read students in own sessions" on public.class_session_students
for select to authenticated using (exists (
  select 1 from public.class_sessions cs
  where cs.id = session_id and cs.teacher_id = auth.uid()
));
create policy "students read own session membership" on public.class_session_students
for select to authenticated using (student_id = auth.uid());

create policy "admins read teacher hours" on public.teacher_hour_entries
for select to authenticated using (public.has_role('admin'));
create policy "teachers read own hours" on public.teacher_hour_entries
for select to authenticated using (teacher_id = auth.uid());

create or replace function public.submit_teaching_completion(
  target_session_id uuid,
  teacher_note text default null
)
returns public.teacher_hour_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session public.class_sessions;
  result public.teacher_hour_entries;
begin
  select * into target_session from public.class_sessions
  where id = target_session_id for update;

  if target_session.id is null then raise exception 'session_not_found'; end if;
  if not public.has_role('teacher') or target_session.teacher_id <> auth.uid() then
    raise exception 'permission_denied';
  end if;
  if target_session.status not in ('confirmed', 'completed') then
    raise exception 'session_not_submittable';
  end if;
  if now() < target_session.starts_at then raise exception 'session_not_started'; end if;

  insert into public.teacher_hour_entries (
    session_id, teacher_id, teaching_date, hours_taught,
    status, submitted_at, submitted_by
  ) values (
    target_session.id,
    target_session.teacher_id,
    (target_session.starts_at at time zone 'Asia/Bangkok')::date,
    target_session.duration_hours,
    'submitted', now(), auth.uid()
  )
  on conflict (session_id) do update set
    status = case
      when teacher_hour_entries.status = 'rejected' then 'submitted'::public.teaching_hour_status
      else teacher_hour_entries.status
    end,
    submitted_at = case
      when teacher_hour_entries.status = 'rejected' then now()
      else teacher_hour_entries.submitted_at
    end,
    rejection_reason = case
      when teacher_hour_entries.status = 'rejected' then null
      else teacher_hour_entries.rejection_reason
    end
  returning * into result;

  update public.class_sessions set
    status = 'completed', completion_notes = teacher_note,
    completed_at = coalesce(completed_at, now())
  where id = target_session.id;

  return result;
end;
$$;

create or replace function public.approve_teacher_hours(
  target_entry_id uuid,
  admin_note text default null
)
returns public.teacher_hour_entries
language plpgsql
security definer
set search_path = public
as $$
declare result public.teacher_hour_entries;
begin
  if not public.has_role('admin') then raise exception 'permission_denied'; end if;
  update public.teacher_hour_entries set
    status = 'approved', approved_at = now(), approved_by = auth.uid(),
    approval_note = admin_note
  where id = target_entry_id and status = 'submitted'
  returning * into result;
  if result.id is null then raise exception 'entry_not_submitted'; end if;
  return result;
end;
$$;

grant execute on function public.submit_teaching_completion(uuid, text) to authenticated;
grant execute on function public.approve_teacher_hours(uuid, text) to authenticated;
