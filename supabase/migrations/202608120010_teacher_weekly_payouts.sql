-- Weekly teacher payout workflow (Monday-Sunday), bank details and paid history.

alter table public.teacher_profiles
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text;

create table if not exists public.teacher_payouts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(user_id),
  period_start date not null,
  period_end date not null,
  total_hours numeric(10,2) not null check (total_hours > 0),
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  paid_at timestamptz not null default now(),
  paid_by uuid not null default auth.uid() references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.teacher_hour_entries
  add column if not exists payout_id uuid references public.teacher_payouts(id),
  add column if not exists paid_at timestamptz;

create index if not exists idx_teacher_hours_unpaid
  on public.teacher_hour_entries (teacher_id, teaching_date)
  where status = 'approved' and payout_id is null;

alter table public.teacher_payouts enable row level security;
drop policy if exists "admins manage teacher payouts" on public.teacher_payouts;
create policy "admins manage teacher payouts" on public.teacher_payouts
for all to authenticated using (public.has_role('admin'))
with check (public.has_role('admin'));
drop policy if exists "teachers read own payouts" on public.teacher_payouts;
create policy "teachers read own payouts" on public.teacher_payouts
for select to authenticated using (
  public.has_role('teacher') and teacher_id = auth.uid()
);

create or replace function public.update_teacher_bank(
  target_teacher_id uuid,
  target_bank_name text,
  target_account_name text,
  target_account_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then raise exception 'permission_denied'; end if;
  update public.teacher_profiles set
    bank_name = nullif(trim(target_bank_name), ''),
    bank_account_name = nullif(trim(target_account_name), ''),
    bank_account_number = nullif(trim(target_account_number), '')
  where user_id = target_teacher_id and archived_at is null;
  if not found then raise exception 'teacher_not_found'; end if;
end;
$$;

create or replace function public.get_admin_teacher_finance()
returns table (
  teacher_id uuid,
  teacher_name text,
  teacher_email text,
  teacher_level smallint,
  hourly_rate numeric,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  unpaid_hours numeric,
  unpaid_amount numeric,
  period_start date,
  period_end date,
  last_paid_at timestamptz
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
    tp.user_id,
    coalesce(p.display_name, p.email::text),
    p.email::text,
    tp.teacher_level,
    tp.hourly_rate,
    tp.bank_name,
    tp.bank_account_name,
    tp.bank_account_number,
    coalesce(sum(the.hours_taught) filter (where the.status = 'approved' and the.payout_id is null), 0),
    coalesce(sum(the.earning_amount) filter (where the.status = 'approved' and the.payout_id is null), 0),
    (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date,
    ((date_trunc('week', now() at time zone 'Asia/Bangkok'))::date + 6),
    (select max(py.paid_at) from public.teacher_payouts py where py.teacher_id = tp.user_id)
  from public.teacher_profiles tp
  join public.profiles p on p.id = tp.user_id
  left join public.teacher_hour_entries the on the.teacher_id = tp.user_id
  where tp.archived_at is null
  group by tp.user_id, p.display_name, p.email, tp.teacher_level, tp.hourly_rate,
    tp.bank_name, tp.bank_account_name, tp.bank_account_number
  order by coalesce(p.display_name, p.email::text);
end;
$$;

create or replace function public.mark_teacher_payout_paid(
  target_teacher_id uuid,
  payment_note text default null
)
returns public.teacher_payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.teacher_profiles;
  payout public.teacher_payouts;
  payout_hours numeric(10,2);
  payout_amount numeric(12,2);
  first_date date;
  last_date date;
begin
  if not public.has_role('admin') then raise exception 'permission_denied'; end if;
  select * into target_profile from public.teacher_profiles
  where user_id = target_teacher_id and archived_at is null;
  if target_profile.user_id is null then raise exception 'teacher_not_found'; end if;
  if target_profile.bank_name is null or target_profile.bank_account_name is null
     or target_profile.bank_account_number is null then
    raise exception 'bank_information_required';
  end if;

  perform id from public.teacher_hour_entries
  where teacher_id = target_teacher_id and status = 'approved' and payout_id is null
  for update;

  select sum(hours_taught), sum(earning_amount), min(teaching_date), max(teaching_date)
  into payout_hours, payout_amount, first_date, last_date
  from public.teacher_hour_entries
  where teacher_id = target_teacher_id and status = 'approved' and payout_id is null
  ;
  if payout_hours is null then raise exception 'no_unpaid_earnings'; end if;

  insert into public.teacher_payouts (
    teacher_id, period_start, period_end, total_hours, gross_amount,
    bank_name, bank_account_name, bank_account_number, note
  ) values (
    target_teacher_id,
    date_trunc('week', first_date::timestamp)::date,
    (date_trunc('week', last_date::timestamp)::date + 6),
    payout_hours, payout_amount,
    target_profile.bank_name, target_profile.bank_account_name,
    target_profile.bank_account_number, payment_note
  ) returning * into payout;

  update public.teacher_hour_entries set payout_id = payout.id, paid_at = payout.paid_at
  where teacher_id = target_teacher_id and status = 'approved' and payout_id is null;
  return payout;
end;
$$;

revoke all on function public.update_teacher_bank(uuid, text, text, text) from public;
revoke all on function public.get_admin_teacher_finance() from public;
revoke all on function public.mark_teacher_payout_paid(uuid, text) from public;
grant execute on function public.update_teacher_bank(uuid, text, text, text) to authenticated;
grant execute on function public.get_admin_teacher_finance() to authenticated;
grant execute on function public.mark_teacher_payout_paid(uuid, text) to authenticated;

-- Teacher balance resets after payment while paid records remain in history.
create or replace function public.get_my_teacher_earnings()
returns table (
  entry_id uuid, session_id uuid, session_title text, teaching_date date,
  hours_taught numeric, hourly_rate numeric, earning_amount numeric,
  approved_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role('teacher') then raise exception 'permission_denied'; end if;
  return query
  select the.id, the.session_id, cs.title, the.teaching_date,
    the.hours_taught, the.hourly_rate_snapshot, the.earning_amount, the.approved_at
  from public.teacher_hour_entries the
  join public.class_sessions cs on cs.id = the.session_id
  where the.teacher_id = auth.uid() and the.status = 'approved' and the.payout_id is null
  order by the.approved_at desc;
end;
$$;
