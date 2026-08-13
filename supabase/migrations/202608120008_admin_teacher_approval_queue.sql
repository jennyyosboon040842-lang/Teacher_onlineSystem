-- Reliable Admin approval queue, independent from nested PostgREST relations.

create or replace function public.get_teacher_approval_queue()
returns table (
  entry_id uuid,
  session_id uuid,
  session_title text,
  teacher_id uuid,
  teacher_name text,
  teaching_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  hours_taught numeric,
  entry_status public.teaching_hour_status,
  earning_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then raise exception 'permission_denied'; end if;

  return query
  select
    the.id,
    cs.id,
    cs.title,
    the.teacher_id,
    coalesce(p.display_name, p.email::text),
    the.teaching_date,
    cs.starts_at,
    cs.ends_at,
    the.hours_taught,
    the.status,
    the.earning_amount
  from public.teacher_hour_entries the
  join public.class_sessions cs on cs.id = the.session_id
  join public.profiles p on p.id = the.teacher_id
  where the.status in ('submitted', 'approved')
  order by
    case when the.status = 'submitted' then 0 else 1 end,
    the.submitted_at desc;
end;
$$;

revoke all on function public.get_teacher_approval_queue() from public;
grant execute on function public.get_teacher_approval_queue() to authenticated;

