-- Approved earnings visible to the signed-in teacher only.

create or replace function public.get_my_teacher_earnings()
returns table (
  entry_id uuid,
  session_id uuid,
  session_title text,
  teaching_date date,
  hours_taught numeric,
  hourly_rate numeric,
  earning_amount numeric,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('teacher') then raise exception 'permission_denied'; end if;

  return query
  select
    the.id,
    the.session_id,
    cs.title,
    the.teaching_date,
    the.hours_taught,
    the.hourly_rate_snapshot,
    the.earning_amount,
    the.approved_at
  from public.teacher_hour_entries the
  join public.class_sessions cs on cs.id = the.session_id
  where the.teacher_id = auth.uid()
    and the.status = 'approved'
  order by the.approved_at desc;
end;
$$;

revoke all on function public.get_my_teacher_earnings() from public;
grant execute on function public.get_my_teacher_earnings() to authenticated;

