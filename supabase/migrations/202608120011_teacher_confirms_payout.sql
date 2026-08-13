-- Teacher confirms receipt after Admin marks a payout as paid.

alter table public.teacher_payouts
  add column if not exists teacher_confirmed_at timestamptz,
  add column if not exists teacher_confirmation_note text;

create or replace function public.get_my_teacher_payouts()
returns table (
  payout_id uuid,
  period_start date,
  period_end date,
  total_hours numeric,
  gross_amount numeric,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  paid_at timestamptz,
  teacher_confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('teacher') then raise exception 'permission_denied'; end if;
  return query
  select py.id, py.period_start, py.period_end, py.total_hours,
    py.gross_amount, py.bank_name, py.bank_account_name,
    py.bank_account_number, py.paid_at, py.teacher_confirmed_at
  from public.teacher_payouts py
  where py.teacher_id = auth.uid()
  order by py.paid_at desc;
end;
$$;

create or replace function public.confirm_teacher_payout_received(
  target_payout_id uuid,
  confirmation_note text default null
)
returns public.teacher_payouts
language plpgsql
security definer
set search_path = public
as $$
declare result public.teacher_payouts;
begin
  if not public.has_role('teacher') then raise exception 'permission_denied'; end if;
  update public.teacher_payouts set
    teacher_confirmed_at = coalesce(teacher_confirmed_at, now()),
    teacher_confirmation_note = coalesce(nullif(trim(confirmation_note), ''), teacher_confirmation_note)
  where id = target_payout_id and teacher_id = auth.uid()
  returning * into result;
  if result.id is null then raise exception 'payout_not_found'; end if;
  return result;
end;
$$;

revoke all on function public.get_my_teacher_payouts() from public;
revoke all on function public.confirm_teacher_payout_received(uuid, text) from public;
grant execute on function public.get_my_teacher_payouts() to authenticated;
grant execute on function public.confirm_teacher_payout_received(uuid, text) to authenticated;

