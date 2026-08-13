-- Speak & Explor English: core auth, course builder and private lesson resources
-- Run with Supabase CLI (`supabase db push`) after linking a project.

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type public.app_role as enum ('admin', 'teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('invited', 'active', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.publish_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.resource_type as enum ('worksheet', 'presentation', 'audio', 'teacher_guide');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  email citext,
  phone text,
  address text,
  timezone text not null default 'Asia/Bangkok',
  currency char(3) not null default 'THB',
  student_billing_weekday smallint not null default 1 check (student_billing_weekday between 1 and 7),
  teacher_payout_period text not null default 'weekly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Speak & Explor English')
on conflict (id) do update set name = excluded.name;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id),
  email citext not null unique,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  avatar_path text,
  status public.account_status not null default 'active',
  locale text not null default 'th-TH',
  timezone text not null default 'Asia/Bangkok',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_code public.app_role not null,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role_code)
);

create table if not exists public.teacher_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  teacher_code text not null unique,
  bio text,
  specialties text[] not null default '{}',
  started_on date,
  archived_at timestamptz
);

create table if not exists public.student_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  student_code text not null unique,
  nickname text,
  guardian_name text,
  guardian_phone text,
  guardian_email citext,
  started_on date,
  archived_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  ) on conflict (id) do nothing;
  if lower(new.email) = 'jenny.yosboon040842@gmail.com' then
    insert into public.user_roles (user_id, role_code)
    values (new.id, 'admin')
    on conflict (user_id, role_code) do update set revoked_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role_code = required_role
      and revoked_at is null
  );
$$;

revoke all on function public.has_role(public.app_role) from public;
grant execute on function public.has_role(public.app_role) to authenticated;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id),
  code text not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  cover_path text,
  status public.publish_status not null default 'draft',
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, code)
);

create table if not exists public.course_role_access (
  course_id uuid not null references public.courses(id) on delete cascade,
  role_code public.app_role not null check (role_code in ('teacher', 'student')),
  can_view boolean not null default false,
  granted_by uuid default auth.uid() references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (course_id, role_code)
);

create table if not exists public.course_levels (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  sort_order integer not null default 0,
  status public.publish_status not null default 'published',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, sort_order)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.course_levels(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  objectives text,
  content jsonb not null default '{}',
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  sort_order integer not null default 0,
  status public.publish_status not null default 'draft',
  available_from timestamptz,
  available_until timestamptz,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level_id, sort_order),
  check (available_until is null or available_from is null or available_until > available_from)
);

create table if not exists public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  type public.resource_type not null,
  title text not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  is_downloadable boolean not null default false,
  status public.publish_status not null default 'draft',
  sort_order integer not null default 0,
  uploaded_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.teacher_course_assignments (
  course_id uuid not null references public.courses(id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
  can_view_teacher_guides boolean not null default true,
  can_edit_lessons boolean not null default false,
  assigned_by uuid default auth.uid() references public.profiles(id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (course_id, teacher_id)
);

create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(user_id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  current_level_id uuid references public.course_levels(id),
  status text not null default 'active' check (status in ('active','completed','paused','cancelled')),
  starts_on date not null default current_date,
  ends_on date,
  enrolled_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_courses_status on public.courses (organization_id, status, sort_order);
create index if not exists idx_levels_course_order on public.course_levels (course_id, sort_order);
create index if not exists idx_lessons_level_order on public.lessons (level_id, sort_order);
create index if not exists idx_resources_lesson_type on public.lesson_resources (lesson_id, type, status);
create index if not exists idx_teacher_course_teacher on public.teacher_course_assignments (teacher_id) where ended_at is null;
create index if not exists idx_enrollment_student_active on public.student_enrollments (student_id, course_id) where status = 'active';

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists courses_updated_at on public.courses;
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
drop trigger if exists levels_updated_at on public.course_levels;
create trigger levels_updated_at before update on public.course_levels for each row execute function public.set_updated_at();
drop trigger if exists lessons_updated_at on public.lessons;
create trigger lessons_updated_at before update on public.lessons for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_role_access enable row level security;
alter table public.course_levels enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_resources enable row level security;
alter table public.teacher_course_assignments enable row level security;
alter table public.student_enrollments enable row level security;

create policy "authenticated read organization" on public.organizations
for select to authenticated using (true);
create policy "admins manage organization" on public.organizations
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "users read own profile" on public.profiles
for select to authenticated using (id = auth.uid() or public.has_role('admin'));
create policy "users update own profile" on public.profiles
for update to authenticated using (id = auth.uid() or public.has_role('admin'))
with check (id = auth.uid() or public.has_role('admin'));
create policy "admins insert profiles" on public.profiles
for insert to authenticated with check (public.has_role('admin'));

create policy "users read own roles" on public.user_roles
for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));
create policy "admins manage roles" on public.user_roles
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "admins manage teacher profiles" on public.teacher_profiles
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "teachers read own teacher profile" on public.teacher_profiles
for select to authenticated using (user_id = auth.uid());
create policy "admins manage student profiles" on public.student_profiles
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "students read own student profile" on public.student_profiles
for select to authenticated using (user_id = auth.uid());

create or replace function public.can_view_course(target_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or exists (
    select 1 from public.courses c
    join public.course_role_access a on a.course_id = c.id and a.can_view
    where c.id = target_course_id and c.status = 'published' and c.archived_at is null
      and (
        (a.role_code = 'teacher' and public.has_role('teacher') and exists (
          select 1 from public.teacher_course_assignments t
          where t.course_id = c.id and t.teacher_id = auth.uid() and t.ended_at is null
        ))
        or
        (a.role_code = 'student' and public.has_role('student') and exists (
          select 1 from public.student_enrollments e
          where e.course_id = c.id and e.student_id = auth.uid() and e.status = 'active'
        ))
      )
  );
$$;

grant execute on function public.can_view_course(uuid) to authenticated;

create policy "permitted users read courses" on public.courses
for select to authenticated using (public.can_view_course(id));
create policy "admins manage courses" on public.courses
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "permitted users read course access" on public.course_role_access
for select to authenticated using (public.can_view_course(course_id));
create policy "admins manage course access" on public.course_role_access
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "permitted users read levels" on public.course_levels
for select to authenticated using (public.can_view_course(course_id));
create policy "admins manage levels" on public.course_levels
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "permitted users read lessons" on public.lessons
for select to authenticated using (
  status = 'published' and public.can_view_course((select course_id from public.course_levels where id = level_id))
);
create policy "admins manage lessons" on public.lessons
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "permitted users read lesson resources" on public.lesson_resources
for select to authenticated using (
  status = 'published'
  and archived_at is null
  and (type <> 'teacher_guide' or public.has_role('admin') or public.has_role('teacher'))
  and public.can_view_course((
    select cl.course_id from public.lessons l
    join public.course_levels cl on cl.id = l.level_id
    where l.id = lesson_id
  ))
);
create policy "admins manage lesson resources" on public.lesson_resources
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "users read own assignment" on public.teacher_course_assignments
for select to authenticated using (teacher_id = auth.uid() or public.has_role('admin'));
create policy "admins manage assignments" on public.teacher_course_assignments
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "users read own enrollment" on public.student_enrollments
for select to authenticated using (student_id = auth.uid() or public.has_role('admin'));
create policy "admins manage enrollments" on public.student_enrollments
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-resources', 'lesson-resources', false, 52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a'
  ]
)
on conflict (id) do update set public = false;

create policy "admins upload lesson files" on storage.objects
for insert to authenticated with check (bucket_id = 'lesson-resources' and public.has_role('admin'));
create policy "admins update lesson files" on storage.objects
for update to authenticated using (bucket_id = 'lesson-resources' and public.has_role('admin'));
create policy "admins delete lesson files" on storage.objects
for delete to authenticated using (bucket_id = 'lesson-resources' and public.has_role('admin'));
create policy "authenticated read authorized lesson files" on storage.objects
for select to authenticated using (
  bucket_id = 'lesson-resources'
  and exists (
    select 1 from public.lesson_resources r
    join public.lessons l on l.id = r.lesson_id
    join public.course_levels cl on cl.id = l.level_id
    where r.storage_path = name
      and r.status = 'published'
      and (r.type <> 'teacher_guide' or public.has_role('admin') or public.has_role('teacher'))
      and public.can_view_course(cl.course_id)
  )
);

-- Bootstrap owner after the Auth account exists. Safe to run repeatedly.
do $$
declare owner_id uuid;
begin
  select id into owner_id from auth.users
  where lower(email) = 'jenny.yosboon040842@gmail.com'
  limit 1;
  if owner_id is not null then
    insert into public.profiles (id, email, display_name)
    values (owner_id, 'jenny.yosboon040842@gmail.com', 'Jenny Yosboon')
    on conflict (id) do update set email = excluded.email;
    insert into public.user_roles (user_id, role_code)
    values (owner_id, 'admin')
    on conflict (user_id, role_code) do update set revoked_at = null;
  end if;
end $$;
