-- Teacher pay levels and earnings created only after Admin approval.

alter table public.teacher_profiles
  add column if not exists teacher_level smallint not null default 1
    check (teacher_level between 1 and 3),
  add column if not exists hourly_rate numeric(10,2) not null default 100
    check (hourly_rate >= 0);

alter table public.teacher_hour_entries
  add column if not exists teacher_level_snapshot smallint,
  add column if not exists hourly_rate_snapshot numeric(10,2),
  add column if not exists earning_amount numeric(12,2);

create or replace function public.set_teacher_level(
  target_teacher_id uuid,
  target_level smallint
)
returns public.teacher_profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.teacher_profiles;
begin
  if not public.has_role('admin') then raise exception 'permission_denied'; end if;
  if target_level not between 1 and 3 then raise exception 'invalid_teacher_level'; end if;

  update public.teacher_profiles set
    teacher_level = target_level,
    hourly_rate = case target_level when 1 then 100 when 2 then 120 else 150 end
  where user_id = target_teacher_id and archived_at is null
  returning * into result;

  if result.user_id is null then raise exception 'teacher_not_found'; end if;
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
declare
  result public.teacher_hour_entries;
  pay_level smallint;
  pay_rate numeric(10,2);
begin
  if not public.has_role('admin') then raise exception 'permission_denied'; end if;

  select tp.teacher_level, tp.hourly_rate into pay_level, pay_rate
  from public.teacher_hour_entries the
  join public.teacher_profiles tp on tp.user_id = the.teacher_id
  where the.id = target_entry_id and the.status = 'submitted'
  for update of the;

  if pay_level is null then raise exception 'entry_not_submitted'; end if;

  update public.teacher_hour_entries set
    status = 'approved', approved_at = now(), approved_by = auth.uid(),
    approval_note = admin_note,
    teacher_level_snapshot = pay_level,
    hourly_rate_snapshot = pay_rate,
    earning_amount = round(hours_taught * pay_rate, 2)
  where id = target_entry_id and status = 'submitted'
  returning * into result;

  return result;
end;
$$;

revoke all on function public.set_teacher_level(uuid, smallint) from public;
grant execute on function public.set_teacher_level(uuid, smallint) to authenticated;
grant execute on function public.approve_teacher_hours(uuid, text) to authenticated;

