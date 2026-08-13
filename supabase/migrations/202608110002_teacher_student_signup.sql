-- Secure self-registration for teacher and student accounts.
-- requested_role is accepted only when it is teacher or student.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  generated_code text;
begin
  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', ''));

  insert into public.profiles (
    id,
    email,
    display_name,
    first_name,
    last_name,
    status
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    'active'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

  -- The owner account is always an admin regardless of submitted metadata.
  if lower(new.email) = 'jenny.yosboon040842@gmail.com' then
    insert into public.user_roles (user_id, role_code)
    values (new.id, 'admin')
    on conflict (user_id, role_code) do update set revoked_at = null;
    return new;
  end if;

  -- Self-registration can never create an admin role.
  if requested_role = 'teacher' then
    insert into public.user_roles (user_id, role_code)
    values (new.id, 'teacher')
    on conflict (user_id, role_code) do update set revoked_at = null;

    generated_code := 'TCH-' || upper(substr(replace(new.id::text, '-', ''), 1, 10));
    insert into public.teacher_profiles (user_id, teacher_code)
    values (new.id, generated_code)
    on conflict (user_id) do nothing;

  elsif requested_role = 'student' then
    insert into public.user_roles (user_id, role_code)
    values (new.id, 'student')
    on conflict (user_id, role_code) do update set revoked_at = null;

    generated_code := 'STD-' || upper(substr(replace(new.id::text, '-', ''), 1, 10));
    insert into public.student_profiles (user_id, student_code, nickname)
    values (
      new.id,
      generated_code,
      nullif(trim(new.raw_user_meta_data ->> 'nickname'), '')
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- The trigger already exists from migration 001. Recreate it explicitly so
-- projects applying this migration independently use the latest function.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
