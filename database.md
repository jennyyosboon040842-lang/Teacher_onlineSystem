# Database Design — Speak & Explor English

## 1. ภาพรวม

เอกสารนี้ออกแบบฐานข้อมูลสำหรับเว็บแอป **Speak & Explor English** โดยใช้ **Supabase** ซึ่งมี PostgreSQL, Supabase Auth, Row Level Security (RLS), Storage และ Edge Functions เป็นองค์ประกอบหลัก

ฐานข้อมูลรองรับฟีเจอร์ต่อไปนี้:

- บัญชีผู้ใช้ด้วยอีเมลและบทบาท Admin, Teacher, Student
- บัญชีเจ้าของระบบ `Jenny.yosboon040842@gmail.com`
- รายวิชา → Level → Lesson
- ใบงาน, PowerPoint, ไฟล์เสียง และคู่มือครู
- การเปิด/ปิดรายวิชาให้ครูและนักเรียน
- ตารางสอนและตารางเรียน พร้อม Google Meet
- การลาของครูและการอนุมัติ
- ชั่วโมงเรียนที่นักเรียนชำระแล้ว ใช้ไป จองไว้ และคงเหลือ
- การบันทึกชั่วโมงสอนของครูและ Admin Approve ทุกวัน
- รายได้ครูและการตัดยอดทุกสัปดาห์
- รายการเรียกเก็บนักเรียนทุกวันจันทร์
- การชำระเงิน อัปโหลดสลิป และแจ้งเตือน LINE
- Notification, Audit Log และการป้องกันไฟล์ private

หลักการสำคัญคือไม่เก็บเฉพาะ “ยอดคงเหลือปัจจุบัน” แต่เก็บรายการเคลื่อนไหวแบบ ledger เพื่อให้ตรวจสอบย้อนหลังและแก้ไขยอดโดยไม่ทำลายประวัติ

---

## 2. Technology และ Convention

| หัวข้อ | แนวทาง |
|---|---|
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth (`auth.users`) |
| Primary key | `uuid` สร้างด้วย `gen_random_uuid()` |
| วันที่และเวลา | `timestamptz` เก็บเป็น UTC |
| เขตเวลาแสดงผล | `Asia/Bangkok` |
| วันที่อย่างเดียว | `date` |
| เวลาอย่างเดียว | `time` |
| จำนวนเงิน | `numeric(12,2)` และ `currency = 'THB'` |
| จำนวนชั่วโมง | `numeric(8,2)` รองรับ 0.5 หรือ 1.5 ชั่วโมง |
| ชื่อตาราง/คอลัมน์ | `snake_case` ภาษาอังกฤษ |
| Soft delete | ใช้ `archived_at` หรือ `status` กับข้อมูลที่มีประวัติอ้างอิง |
| Audit columns | `created_at`, `updated_at`, `created_by`, `updated_by` ตามความเหมาะสม |

ทุกตารางใน `public` ต้องเปิด RLS และห้ามใช้ `service_role` key จาก browser

---

## 3. Entity Relationship ภาพรวม

```text
auth.users
    │ 1:1
    ▼
profiles ─────< user_roles >───── roles
    │
    ├── 1:1 teacher_profiles ─────< teacher_rates
    │
    └── 1:1 student_profiles

courses ─────< course_levels ─────< lessons ─────< lesson_resources
   │                                       │
   ├─────< course_role_access              └──── teacher-only resource
   ├─────< teacher_course_assignments
   └─────< student_enrollments

class_series ─────< class_sessions ─────< class_session_students
                         │                         │
                         │                         └──── student_hour_ledger
                         └──── teacher_hour_entries ──── teacher_earning_ledger

student_packages ─────< student_hour_ledger
student_invoices ─────< payments

teacher_payout_cycles ─────< teacher_payout_items ───── teacher_earning_ledger

teacher_leave_requests ─────< leave_affected_sessions

notifications
audit_logs
```

---

## 4. Enum Types

แนะนำให้สร้าง PostgreSQL enums เพื่อจำกัดค่าที่อนุญาต

```sql
create type app_role as enum ('admin', 'teacher', 'student');

create type account_status as enum (
  'invited', 'active', 'suspended', 'archived'
);

create type publish_status as enum (
  'draft', 'published', 'archived'
);

create type resource_type as enum (
  'worksheet', 'presentation', 'audio', 'teacher_guide'
);

create type class_status as enum (
  'draft', 'confirmed', 'completed', 'cancelled',
  'rescheduled', 'teacher_leave', 'student_absent'
);

create type teaching_hour_status as enum (
  'draft', 'submitted', 'approved', 'rejected', 'reversed'
);

create type leave_status as enum (
  'draft', 'pending', 'approved', 'rejected', 'cancelled'
);

create type invoice_status as enum (
  'draft', 'pending', 'under_review', 'paid',
  'rejected', 'overdue', 'cancelled', 'refunded'
);

create type payment_status as enum (
  'pending', 'under_review', 'verified', 'rejected',
  'cancelled', 'refunded'
);

create type ledger_direction as enum ('credit', 'debit');

create type earning_status as enum (
  'pending_approval', 'approved', 'scheduled',
  'paid', 'held', 'cancelled', 'reversed'
);

create type payout_status as enum (
  'draft', 'reviewing', 'scheduled', 'paid', 'cancelled'
);

create type notification_channel as enum ('in_app', 'email', 'line');
create type delivery_status as enum ('pending', 'sent', 'failed', 'cancelled');
```

หากคาดว่าจะเพิ่มสถานะบ่อย สามารถใช้ `text` + `check constraint` แทน enum เพื่อให้ migration ยืดหยุ่นขึ้น

---

## 5. Authentication, User และ Role

### 5.1 `profiles`

ข้อมูลผู้ใช้ร่วมของทุกบทบาท เชื่อมกับ `auth.users`

| Column | Type | Constraint/รายละเอียด |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users.id`, `on delete cascade` |
| `email` | citext | not null, unique, sync จาก Auth |
| `first_name` | text | null ได้ระหว่างรอรับคำเชิญ |
| `last_name` | text | null ได้ |
| `display_name` | text | ชื่อที่ใช้ในระบบ |
| `phone` | text | nullable |
| `avatar_path` | text | path ใน private/public avatar bucket |
| `status` | account_status | default `invited` |
| `locale` | text | default `th-TH` |
| `timezone` | text | default `Asia/Bangkok` |
| `last_seen_at` | timestamptz | nullable |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | trigger update |

ไม่ควรใช้ `profiles.email` เป็นตัวระบุความสัมพันธ์หลัก ให้ใช้ UUID เสมอ

### 5.2 `roles`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | smallint generated identity | PK |
| `code` | app_role | unique |
| `name_th` | text | ชื่อภาษาไทย |
| `description` | text | nullable |

Seed เริ่มต้น: `admin`, `teacher`, `student`

### 5.3 `user_roles`

รองรับผู้ใช้หนึ่งคนมีมากกว่าหนึ่งบทบาทในอนาคต

| Column | Type | Constraint |
|---|---|---|
| `user_id` | uuid | FK → profiles.id |
| `role_id` | smallint | FK → roles.id |
| `assigned_by` | uuid | FK → profiles.id, nullable สำหรับ bootstrap |
| `assigned_at` | timestamptz | default now() |
| `revoked_at` | timestamptz | nullable |

PK: `(user_id, role_id)`

### 5.4 System Owner

บัญชีเจ้าของระบบ:

```text
jenny.yosboon040842@gmail.com
```

ขั้นตอน bootstrap:

1. สมัครหรือเชิญอีเมลนี้ใน Supabase Auth
2. Trigger สร้าง `profiles`
3. Migration หรือ server-side function เพิ่ม `admin` ใน `user_roles`
4. ห้ามกำหนด Admin จาก client-side email comparison
5. ป้องกันการลบ/ถอน role ของ System Owner โดยใช้ database function ที่ตรวจสิทธิ์

แนะนำให้เก็บ UUID เจ้าของระบบใน Supabase Vault/Environment หรือ `system_settings.owner_user_id` หลังสร้างบัญชีสำเร็จ ไม่ใช้ email เป็น authorization rule ระยะยาว

### 5.5 `teacher_profiles`

| Column | Type | รายละเอียด |
|---|---|---|
| `user_id` | uuid | PK/FK → profiles.id |
| `teacher_code` | text | unique, not null |
| `bio` | text | nullable |
| `specialties` | text[] | รายวิชา/ความถนัด |
| `bank_account_name` | text | encrypted/จำกัดสิทธิ์ |
| `bank_account_number` | text | encrypted/จำกัดสิทธิ์ |
| `bank_name` | text | nullable |
| `started_on` | date | nullable |
| `archived_at` | timestamptz | nullable |

### 5.6 `student_profiles`

| Column | Type | รายละเอียด |
|---|---|---|
| `user_id` | uuid | PK/FK → profiles.id |
| `student_code` | text | unique, not null |
| `nickname` | text | nullable |
| `guardian_name` | text | nullable |
| `guardian_phone` | text | nullable |
| `guardian_email` | citext | nullable |
| `started_on` | date | nullable |
| `archived_at` | timestamptz | nullable |

---

## 6. Organization และ Settings

### 6.1 `organizations`

แม้ MVP จะมีบริษัทเดียว ควรมีตารางองค์กรเพื่อไม่ hard-code ข้อมูล

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | default `Speak & Explor English` |
| `legal_name` | text | nullable |
| `email` | citext | nullable |
| `phone` | text | nullable |
| `address` | text | nullable |
| `timezone` | text | default `Asia/Bangkok` |
| `currency` | char(3) | default `THB` |
| `student_billing_weekday` | smallint | default 1; ISO Monday = 1 |
| `teacher_payout_period` | text | default `weekly` |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | trigger |

Constraint: `student_billing_weekday between 1 and 7`

### 6.2 `system_settings`

เก็บค่าที่ไม่ควรสร้างเป็น column บ่อย แต่ไม่ควรเก็บ secret

| Column | Type |
|---|---|
| `key` | text PK |
| `value` | jsonb |
| `description` | text |
| `updated_by` | uuid FK |
| `updated_at` | timestamptz |

Secret ของ LINE, Payment Gateway และ service key ต้องเก็บใน Supabase Vault/Environment ไม่เก็บในตารางนี้

---

## 7. รายวิชา, Level, Lesson และไฟล์

### 7.1 `courses`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | FK → organizations.id |
| `code` | text | unique ภายในองค์กร |
| `name` | text | not null |
| `description` | text | nullable |
| `cover_path` | text | nullable |
| `status` | publish_status | default `draft` |
| `published_at` | timestamptz | nullable |
| `published_by` | uuid | FK → profiles.id |
| `sort_order` | integer | default 0 |
| `created_by` | uuid | FK → profiles.id |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | trigger |
| `archived_at` | timestamptz | nullable |

Unique: `(organization_id, code)`

### 7.2 `course_role_access`

กำหนดว่า course เปิดให้ role ใดดูได้ การมีแถวหมายถึงได้รับสิทธิ์ระดับ role

| Column | Type | รายละเอียด |
|---|---|---|
| `course_id` | uuid | FK → courses.id |
| `role_code` | app_role | ใช้ `teacher` หรือ `student` |
| `can_view` | boolean | default false |
| `granted_by` | uuid | FK → profiles.id |
| `granted_at` | timestamptz | default now() |

PK: `(course_id, role_code)`

Constraint: `role_code in ('teacher','student')`

Course ต้องมี `status = 'published'` และ `can_view = true` ผู้ใช้ role นั้นจึงเห็น

### 7.3 `course_levels`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK → courses.id, cascade |
| `name` | text | เช่น Beginner, Level 1 |
| `description` | text | nullable |
| `sort_order` | integer | not null |
| `status` | publish_status | default draft |
| `created_by` | uuid | FK → profiles.id |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | trigger |

Unique: `(course_id, sort_order)` และอาจเพิ่ม `(course_id, lower(name))`

### 7.4 `lessons`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `level_id` | uuid | FK → course_levels.id, cascade |
| `title` | text | not null |
| `description` | text | nullable |
| `objectives` | text | nullable |
| `content` | jsonb | rich text/block content |
| `estimated_minutes` | integer | nullable, > 0 |
| `sort_order` | integer | not null |
| `status` | publish_status | default draft |
| `available_from` | timestamptz | nullable |
| `available_until` | timestamptz | nullable |
| `created_by` | uuid | FK → profiles.id |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | trigger |

Constraint: `available_until is null or available_from is null or available_until > available_from`

### 7.5 `lesson_resources`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `lesson_id` | uuid | FK → lessons.id, cascade |
| `type` | resource_type | worksheet/presentation/audio/teacher_guide |
| `title` | text | ชื่อแสดงผล |
| `storage_path` | text | path ใน private bucket, unique |
| `original_filename` | text | ชื่อไฟล์ต้นฉบับ |
| `mime_type` | text | not null |
| `size_bytes` | bigint | > 0 |
| `duration_seconds` | integer | เฉพาะ audio, nullable |
| `is_downloadable` | boolean | default false |
| `status` | publish_status | default draft |
| `sort_order` | integer | default 0 |
| `uploaded_by` | uuid | FK → profiles.id |
| `created_at` | timestamptz | default now() |
| `archived_at` | timestamptz | nullable |

Visibility:

| Resource type | Admin | Teacher | Student |
|---|:---:|:---:|:---:|
| worksheet | CRUD | ดู | ดู |
| presentation | CRUD | ดู | ดู |
| audio | CRUD | ดู | ดู |
| teacher_guide | CRUD | ดู | ห้ามดู |

RLS และ Storage policy ต้องตรวจ `type != 'teacher_guide'` สำหรับ Student ทุกครั้ง ไม่พึ่งเพียงการซ่อนหน้าเว็บ

### 7.6 `teacher_course_assignments`

กำหนดรายวิชาเฉพาะที่ครูรับผิดชอบ เพิ่มความละเอียดจาก role-level access

| Column | Type |
|---|---|
| `course_id` | uuid FK |
| `teacher_id` | uuid FK → teacher_profiles.user_id |
| `can_view_teacher_guides` | boolean default true |
| `can_edit_lessons` | boolean default false |
| `assigned_by` | uuid FK |
| `assigned_at` | timestamptz |
| `ended_at` | timestamptz nullable |

Unique active assignment: `(course_id, teacher_id)` where `ended_at is null`

### 7.7 `student_enrollments`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | FK → student_profiles.user_id |
| `course_id` | uuid | FK → courses.id |
| `current_level_id` | uuid | FK → course_levels.id, nullable |
| `status` | text | active/completed/paused/cancelled |
| `starts_on` | date | not null |
| `ends_on` | date | nullable |
| `enrolled_by` | uuid | FK → profiles.id |
| `created_at` | timestamptz | default now() |

Student ต้องมี active enrollment และ course เปิด student access จึงเห็น Lesson

---

## 8. ตารางเรียนและ Google Meet

### 8.1 `class_series`

เก็บชุดคาบที่เกิดซ้ำ

| Column | Type |
|---|---|
| `id` | uuid PK |
| `course_id` | uuid FK |
| `teacher_id` | uuid FK |
| `title` | text |
| `recurrence_rule` | text nullable |
| `starts_on` | date |
| `ends_on` | date nullable |
| `default_duration_minutes` | integer |
| `created_by` | uuid FK |
| `created_at` | timestamptz |

### 8.2 `class_sessions`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `series_id` | uuid | FK, nullable |
| `course_id` | uuid | FK, not null |
| `level_id` | uuid | FK, nullable |
| `lesson_id` | uuid | FK, nullable |
| `teacher_id` | uuid | FK → teacher_profiles.user_id |
| `starts_at` | timestamptz | not null |
| `ends_at` | timestamptz | not null |
| `duration_hours` | numeric(8,2) | generated/validated |
| `status` | class_status | default draft |
| `meet_url_encrypted` | text | nullable |
| `meet_visible_from` | timestamptz | nullable |
| `meet_visible_until` | timestamptz | nullable |
| `completion_notes` | text | nullable |
| `completed_at` | timestamptz | nullable |
| `created_by` | uuid | FK |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | trigger |

Constraints:

- `ends_at > starts_at`
- `duration_hours > 0`
- ห้ามตารางครูชนกันสำหรับสถานะที่ active
- Meet URL แสดงเฉพาะผู้เกี่ยวข้องและช่วงเวลาที่กำหนด

PostgreSQL สามารถใช้ exclusion constraint กับ `tstzrange` เพื่อป้องกันตารางครูชน

### 8.3 `class_session_students`

รองรับคาบตัวต่อตัวและกลุ่ม

| Column | Type |
|---|---|
| `session_id` | uuid FK |
| `student_id` | uuid FK |
| `enrollment_id` | uuid FK nullable |
| `attendance_status` | text |
| `hours_to_deduct` | numeric(8,2) |
| `joined_at` | timestamptz nullable |
| `left_at` | timestamptz nullable |
| `note` | text nullable |

PK: `(session_id, student_id)`

---

## 9. ชั่วโมงสอนและ Admin Approve รายวัน

### 9.1 `teacher_hour_entries`

หนึ่งรายการต่อครูต่อคาบ เป็นแหล่งข้อมูลการรับรองชั่วโมงสอน

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK → class_sessions.id, unique |
| `teacher_id` | uuid | FK → teacher_profiles.user_id |
| `teaching_date` | date | วันที่ตาม Asia/Bangkok |
| `hours_taught` | numeric(8,2) | > 0 |
| `status` | teaching_hour_status | default draft |
| `submitted_at` | timestamptz | ครูกดยืนยันว่าสอนแล้ว |
| `submitted_by` | uuid | ปกติเป็น teacher_id |
| `approved_at` | timestamptz | nullable |
| `approved_by` | uuid | Admin, nullable |
| `rejected_at` | timestamptz | nullable |
| `rejected_by` | uuid | nullable |
| `rejection_reason` | text | บังคับเมื่อ rejected |
| `approval_note` | text | nullable |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | trigger |

Workflow:

```text
คาบ completed
   ↓
Teacher submit ชั่วโมง
   ↓ status = submitted
Admin ตรวจทุกวัน
   ├── approve → status = approved → สร้าง teacher earning
   └── reject  → status = rejected → ระบุเหตุผล
```

Business rules:

1. ครูแก้ได้เฉพาะ `draft` หรือรายการ rejected ที่เปิดให้ส่งใหม่
2. เฉพาะ Admin เปลี่ยน `submitted` เป็น `approved/rejected`
3. Approve ต้องทำด้วย database function transaction
4. รายการ approved ห้ามแก้ทับ หากผิดให้สร้าง reversal/adjustment
5. Admin dashboard แสดง submitted ที่ `teaching_date <= current_date`
6. ระบบแจ้งรายการที่ยังไม่ถูก Approve เมื่อสิ้นวัน

### 9.2 ชั่วโมงสอนแล้วและชั่วโมงที่ยังเหลือของครู

- ชั่วโมงสอนแล้ว: `sum(hours_taught)` ของรายการ `approved` ในรอบสัปดาห์
- ชั่วโมงรอรับรอง: `sum(hours_taught)` ของรายการ `submitted`
- ชั่วโมงที่ยังเหลือ: ผลรวม duration ของ `class_sessions` ที่ยืนยันแล้วและอยู่หลังเวลาปัจจุบันภายในรอบสัปดาห์

ควรสร้าง view:

```sql
create view teacher_weekly_hour_summary as
select
  teacher_id,
  date_trunc('week', teaching_date)::date as week_start,
  sum(hours_taught) filter (where status = 'approved') as approved_hours,
  sum(hours_taught) filter (where status = 'submitted') as pending_hours
from teacher_hour_entries
group by teacher_id, date_trunc('week', teaching_date);
```

ไม่ควรบันทึก `remaining_hours` ลง column ถาวร เพราะคำนวณจากตารางที่เปลี่ยนได้

---

## 10. เรตและรายได้ครู

### 10.1 `teacher_rates`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `teacher_id` | uuid FK |
| `course_id` | uuid FK nullable |
| `rate_type` | text | hourly/session/fixed |
| `rate_amount` | numeric(12,2) |
| `currency` | char(3) default THB |
| `effective_from` | date |
| `effective_until` | date nullable |
| `created_by` | uuid FK |
| `created_at` | timestamptz |

ห้ามให้ช่วง effective date ของ teacher/course เดียวกันซ้อนกัน

### 10.2 `teacher_earning_ledger`

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `teacher_id` | uuid | FK |
| `teacher_hour_entry_id` | uuid | FK, nullable สำหรับ adjustment |
| `direction` | ledger_direction | credit/debit |
| `hours_snapshot` | numeric(8,2) | ชั่วโมง ณ ตอน Approve |
| `rate_snapshot` | numeric(12,2) | เรต ณ ตอน Approve |
| `amount` | numeric(12,2) | not null |
| `currency` | char(3) | default THB |
| `earning_date` | date | วันที่สอน |
| `week_start` | date | วันเริ่มรอบ |
| `week_end` | date | วันสิ้นสุดรอบ |
| `status` | earning_status | default approved |
| `reason` | text | nullable/บังคับสำหรับ adjustment |
| `reverses_entry_id` | uuid | self FK nullable |
| `created_by` | uuid | Admin/system |
| `created_at` | timestamptz | default now() |

Unique partial index: หนึ่ง earning ปกติต่อ `teacher_hour_entry_id`

### 10.3 `teacher_payout_cycles`

ตัดยอดทุกสัปดาห์

| Column | Type |
|---|---|
| `id` | uuid PK |
| `week_start` | date |
| `week_end` | date |
| `cutoff_at` | timestamptz |
| `scheduled_payment_date` | date nullable |
| `status` | payout_status |
| `created_at` | timestamptz |
| `closed_at` | timestamptz nullable |
| `closed_by` | uuid nullable |

Unique: `(week_start, week_end)`

ค่าเริ่มต้นแนะนำ: วันจันทร์ 00:00 ถึงวันอาทิตย์ 23:59:59 ตาม Asia/Bangkok และตัดยอดหลังสิ้นวันอาทิตย์

### 10.4 `teacher_payouts`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `cycle_id` | uuid FK |
| `teacher_id` | uuid FK |
| `gross_amount` | numeric(12,2) |
| `adjustment_amount` | numeric(12,2) default 0 |
| `net_amount` | numeric(12,2) |
| `status` | payout_status |
| `scheduled_date` | date nullable |
| `paid_at` | timestamptz nullable |
| `payment_reference` | text nullable |
| `proof_storage_path` | text nullable |
| `approved_by` | uuid nullable |
| `created_at` | timestamptz |

Unique: `(cycle_id, teacher_id)`

### 10.5 `teacher_payout_items`

| Column | Type |
|---|---|
| `payout_id` | uuid FK |
| `earning_entry_id` | uuid FK, unique |
| `amount_snapshot` | numeric(12,2) |

PK: `(payout_id, earning_entry_id)`

ครูเห็นเฉพาะ payout/earning ของตนเอง Admin เห็นและจัดการทั้งหมด

---

## 11. ชั่วโมงนักเรียน

### 11.1 `packages`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `course_id` | uuid FK nullable |
| `name` | text |
| `included_hours` | numeric(8,2) |
| `price` | numeric(12,2) |
| `currency` | char(3) default THB |
| `valid_days` | integer nullable |
| `status` | publish_status |
| `created_at` | timestamptz |

### 11.2 `student_packages`

แพ็กเกจที่นักเรียนซื้อจริง

| Column | Type |
|---|---|
| `id` | uuid PK |
| `student_id` | uuid FK |
| `package_id` | uuid FK |
| `invoice_id` | uuid FK nullable |
| `hours_purchased_snapshot` | numeric(8,2) |
| `price_snapshot` | numeric(12,2) |
| `starts_on` | date |
| `expires_on` | date nullable |
| `status` | text |
| `created_at` | timestamptz |

### 11.3 `student_hour_ledger`

เป็น source of truth ของชั่วโมงที่จ่ายและชั่วโมงคงเหลือ

| Column | Type | รายละเอียด |
|---|---|---|
| `id` | uuid | PK |
| `student_id` | uuid | FK |
| `student_package_id` | uuid | FK nullable |
| `session_id` | uuid | FK nullable |
| `direction` | ledger_direction | credit/debit |
| `hours` | numeric(8,2) | > 0 |
| `entry_type` | text | purchase/usage/refund/expiry/adjustment/reservation/release |
| `effective_at` | timestamptz | not null |
| `reason` | text | nullable; บังคับเมื่อ adjustment |
| `reverses_entry_id` | uuid | self FK nullable |
| `created_by` | uuid | Admin/system |
| `created_at` | timestamptz | default now() |

การคำนวณ:

```text
ชั่วโมงที่ชำระแล้ว = sum(credit purchase) - refund/expiry
ชั่วโมงใช้ไป       = sum(debit usage)
ชั่วโมงจองไว้       = sum(debit reservation) - release
ชั่วโมงคงเหลือ      = sum(credit) - sum(debit)
```

Rules:

1. ห้ามยอดคงเหลือติดลบ เว้นแต่ Admin override พร้อมเหตุผล
2. เมื่อ Payment verified จึงสร้าง purchase credit
3. เมื่อคาบ completed และ Admin ยืนยันผลคาบจึงสร้าง usage debit
4. การยกเลิกคาบตามเงื่อนไขต้องสร้าง release/refund entry ไม่ลบรายการเดิม
5. ทุก function ต้อง idempotent เพื่อไม่เพิ่ม/หักชั่วโมงซ้ำ

แนะนำ view `student_hour_balances` รวมยอดต่อ student และ course/package

---

## 12. การเรียกเก็บทุกวันจันทร์และ Payment

### 12.1 `billing_plans`

กำหนดแผนเรียกเก็บประจำของนักเรียน

| Column | Type |
|---|---|
| `id` | uuid PK |
| `student_id` | uuid FK |
| `package_id` | uuid FK nullable |
| `weekday` | smallint default 1 |
| `hours_per_cycle` | numeric(8,2) |
| `amount_per_cycle` | numeric(12,2) |
| `starts_on` | date |
| `ends_on` | date nullable |
| `is_active` | boolean default true |
| `next_billing_date` | date |
| `created_by` | uuid FK |
| `created_at` | timestamptz |

Constraint: `weekday = 1` สำหรับนโยบายปัจจุบันที่เรียกเก็บทุกวันจันทร์

### 12.2 `student_invoices`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `invoice_number` | text unique |
| `student_id` | uuid FK |
| `billing_plan_id` | uuid FK nullable |
| `package_id` | uuid FK nullable |
| `billing_week_start` | date |
| `billing_week_end` | date |
| `hours_to_credit` | numeric(8,2) |
| `subtotal` | numeric(12,2) |
| `discount` | numeric(12,2) default 0 |
| `total_amount` | numeric(12,2) |
| `currency` | char(3) default THB |
| `issued_at` | timestamptz |
| `due_date` | date | ทุกวันจันทร์ตาม policy |
| `status` | invoice_status |
| `paid_at` | timestamptz nullable |
| `created_at` | timestamptz |

Unique ป้องกันสร้างซ้ำ: `(billing_plan_id, billing_week_start)`

### 12.3 `payments`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `invoice_id` | uuid FK |
| `student_id` | uuid FK |
| `payment_method` | text |
| `amount` | numeric(12,2) |
| `status` | payment_status |
| `slip_storage_path` | text nullable |
| `external_reference` | text nullable |
| `submitted_at` | timestamptz nullable |
| `verified_at` | timestamptz nullable |
| `verified_by` | uuid nullable |
| `rejected_at` | timestamptz nullable |
| `rejected_by` | uuid nullable |
| `rejection_reason` | text nullable |
| `line_notification_status` | delivery_status |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

Payment verification transaction:

1. Lock payment และ invoice (`FOR UPDATE`)
2. ตรวจ payment ยังไม่ verified
3. เปลี่ยน payment เป็น verified
4. เปลี่ยน invoice เป็น paid
5. สร้าง `student_packages` หากเป็น package ใหม่
6. สร้าง credit ใน `student_hour_ledger`
7. สร้าง audit log และ notification
8. Commit ทั้งหมดพร้อมกัน

---

## 13. การลาของครู

### 13.1 `teacher_leave_requests`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `teacher_id` | uuid FK |
| `leave_type` | text |
| `starts_at` | timestamptz |
| `ends_at` | timestamptz |
| `reason` | text |
| `attachment_path` | text nullable |
| `status` | leave_status |
| `submitted_at` | timestamptz |
| `reviewed_at` | timestamptz nullable |
| `reviewed_by` | uuid nullable |
| `review_note` | text nullable |
| `created_at` | timestamptz |

### 13.2 `leave_affected_sessions`

| Column | Type |
|---|---|
| `leave_request_id` | uuid FK |
| `session_id` | uuid FK |
| `resolution` | text | cancel/reschedule/substitute_teacher |
| `replacement_teacher_id` | uuid nullable |
| `replacement_session_id` | uuid nullable |
| `resolved_by` | uuid nullable |
| `resolved_at` | timestamptz nullable |

PK: `(leave_request_id, session_id)`

---

## 14. Notification และ LINE

### 14.1 `notifications`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `recipient_id` | uuid FK |
| `type` | text |
| `title` | text |
| `message` | text |
| `action_url` | text nullable |
| `entity_type` | text nullable |
| `entity_id` | uuid nullable |
| `read_at` | timestamptz nullable |
| `created_at` | timestamptz |

### 14.2 `notification_deliveries`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `notification_id` | uuid FK |
| `channel` | notification_channel |
| `status` | delivery_status |
| `attempt_count` | integer default 0 |
| `provider_message_id` | text nullable |
| `last_error` | text nullable |
| `next_retry_at` | timestamptz nullable |
| `sent_at` | timestamptz nullable |
| `created_at` | timestamptz |

ใช้ queue/Edge Function ส่ง Email และ LINE เพื่อไม่ให้ transaction หลักล้มเมื่อ provider ภายนอกมีปัญหา

---

## 15. Audit Log

### 15.1 `audit_logs`

| Column | Type |
|---|---|
| `id` | bigint generated always as identity PK |
| `actor_id` | uuid nullable |
| `actor_role` | app_role nullable |
| `action` | text |
| `entity_table` | text |
| `entity_id` | uuid nullable |
| `before_data` | jsonb nullable |
| `after_data` | jsonb nullable |
| `reason` | text nullable |
| `request_id` | uuid nullable |
| `ip_address` | inet nullable |
| `user_agent` | text nullable |
| `created_at` | timestamptz default now() |

ต้อง Audit อย่างน้อย:

- การเปลี่ยน role และสถานะบัญชี
- การเผยแพร่รายวิชาและเปิดสิทธิ์ Teacher/Student
- การเพิ่ม/ลบ/เปลี่ยนสิทธิ์ไฟล์
- การแก้ตารางและ Google Meet
- การ Approve/Reject ชั่วโมงสอน
- การเปลี่ยนเรตและรายได้ครู
- การตรวจสลิปและเพิ่มชั่วโมงนักเรียน
- การปรับชั่วโมงและรายการ reversal
- การปิดรอบและจ่ายรายได้ครู

Audit log เป็น append-only ผู้ใช้ทั่วไปห้าม update/delete

---

## 16. Supabase Storage

### Buckets

| Bucket | Public | ใช้เก็บ |
|---|:---:|---|
| `avatars` | เลือกได้ | รูปโปรไฟล์ |
| `lesson-resources` | No | ใบงาน, PPT, audio, คู่มือครู |
| `payment-slips` | No | สลิปนักเรียน |
| `leave-attachments` | No | เอกสารการลา |
| `payout-proofs` | No | หลักฐานจ่ายครู |

Path convention:

```text
lesson-resources/{course_id}/{level_id}/{lesson_id}/{resource_id}/{filename}
payment-slips/{student_id}/{invoice_id}/{payment_id}/{filename}
leave-attachments/{teacher_id}/{leave_request_id}/{filename}
payout-proofs/{teacher_id}/{payout_id}/{filename}
```

Policy สำคัญ:

- Admin upload/update/delete lesson resources
- Teacher อ่านไฟล์ใน course ที่ได้รับ assignment รวม teacher guide
- Student อ่านไฟล์ใน enrollment ที่ active ยกเว้น `teacher_guide`
- Student upload สลิปของตน แต่ห้ามอ่านสลิปของผู้อื่น
- ไฟล์ private เปิดผ่าน signed URL อายุสั้น
- ตรวจ MIME type, extension, ขนาด และ malware ก่อนเปลี่ยน resource เป็น published
- ห้ามใช้ filename จากผู้ใช้เป็น storage path โดยตรง

---

## 17. Row Level Security Matrix

| Resource | Admin | Teacher | Student |
|---|---|---|---|
| profiles | ทั้งหมด | ตนเอง/นักเรียนในคาบเท่าที่จำเป็น | ตนเอง |
| courses | CRUD | published + ได้รับสิทธิ์ | published + enrollment + ได้รับสิทธิ์ |
| levels/lessons | CRUD | ตาม course assignment | ตาม enrollment |
| worksheet/PPT/audio | CRUD | ดูตาม assignment | ดูตาม enrollment |
| teacher guide | CRUD | ดูตาม assignment | ห้ามทั้งหมด |
| class sessions | CRUD | เฉพาะคาบตน | เฉพาะคาบตน |
| teacher hours | ทั้งหมด/Approve | ของตนและ submit | ห้าม |
| teacher earnings/payout | ทั้งหมด | ของตน | ห้าม |
| student hour ledger | ทั้งหมด | อ่านเฉพาะที่จำเป็นในคาบ | ของตน |
| invoices/payments | ทั้งหมด | ห้าม | ของตน |
| leave requests | ทั้งหมด/Approve | ของตน | ห้าม |
| audit logs | อ่าน | ห้าม | ห้าม |

Helper functions แนะนำ:

```sql
private.has_role(user_id uuid, role app_role) returns boolean
private.is_admin() returns boolean
private.is_course_teacher(course_id uuid) returns boolean
private.is_course_student(course_id uuid) returns boolean
private.can_view_lesson(lesson_id uuid) returns boolean
```

ใช้ `security definer` อย่างระมัดระวัง กำหนด `search_path` แบบตายตัว และ revoke execute จาก public หากไม่ต้องการให้ client เรียกโดยตรง

ตัวอย่างแนวคิด policy:

```sql
create policy "students read permitted lesson resources"
on lesson_resources for select
to authenticated
using (
  type <> 'teacher_guide'
  and status = 'published'
  and private.can_view_lesson(lesson_id)
);
```

---

## 18. Database Functions สำคัญ

ควรทำ workflow ที่เกี่ยวกับเงินและชั่วโมงผ่าน PostgreSQL function/Edge Function ไม่ให้ client insert ledger โดยตรง

### `approve_teacher_hours(entry_id, note)`

- ตรวจ caller เป็น Admin
- lock `teacher_hour_entries`
- ตรวจ status = submitted
- หา teacher rate ที่มีผลในวันสอน
- เปลี่ยน entry เป็น approved
- สร้าง `teacher_earning_ledger` พร้อม snapshot
- สร้าง audit และ notification
- idempotent หากเรียกซ้ำ

### `verify_student_payment(payment_id)`

- ตรวจ caller เป็น Admin
- lock payment/invoice
- mark verified/paid
- สร้าง student package และ credit hours
- audit + notification
- idempotent

### `consume_student_hours(session_id, student_id)`

- ตรวจ session completed
- ตรวจยังไม่มี usage entry
- ตรวจยอดคงเหลือ
- สร้าง debit
- audit + notification เมื่อยอดต่ำ

### `close_weekly_teacher_payout_cycle(week_start)`

- รันด้วย Admin/cron service
- ตรวจไม่มี submitted hours ค้างในรอบ หรือ flag ให้ Admin ทราบ
- สร้าง payout cycle
- รวม approved earning ที่ยังไม่ถูก payout
- สร้าง teacher payouts และ payout items
- เปลี่ยน earning เป็น scheduled
- audit + notification

### `generate_monday_student_invoices(billing_date)`

- รันทุกวันจันทร์ตาม Asia/Bangkok
- เลือก active billing plans ที่ถึง `next_billing_date`
- สร้าง invoice แบบ idempotent
- อัปเดต `next_billing_date + 7 days`
- ส่ง notification ให้นักเรียน

---

## 19. Indexes

Indexes ที่แนะนำ:

```sql
create index idx_profiles_email on profiles (email);
create index idx_user_roles_active on user_roles (user_id) where revoked_at is null;

create index idx_courses_status on courses (organization_id, status, sort_order);
create index idx_levels_course_order on course_levels (course_id, sort_order);
create index idx_lessons_level_order on lessons (level_id, sort_order);
create index idx_resources_lesson_type on lesson_resources (lesson_id, type, status);

create index idx_sessions_teacher_time on class_sessions (teacher_id, starts_at);
create index idx_sessions_course_time on class_sessions (course_id, starts_at);
create index idx_session_students_student on class_session_students (student_id, session_id);

create index idx_teacher_hours_daily_pending
  on teacher_hour_entries (teaching_date, status)
  where status = 'submitted';

create index idx_teacher_hours_teacher_week
  on teacher_hour_entries (teacher_id, teaching_date, status);

create index idx_earnings_teacher_week
  on teacher_earning_ledger (teacher_id, week_start, status);

create index idx_student_hours_student_time
  on student_hour_ledger (student_id, effective_at);

create index idx_invoices_student_status
  on student_invoices (student_id, status, due_date);

create index idx_payments_review
  on payments (status, submitted_at)
  where status = 'under_review';

create index idx_notifications_unread
  on notifications (recipient_id, created_at desc)
  where read_at is null;

create index idx_audit_entity
  on audit_logs (entity_table, entity_id, created_at desc);
```

หลีกเลี่ยง index ซ้ำกับ PK/unique index และตรวจ query plan หลังมีข้อมูลจริง

---

## 20. Constraints และ Data Integrity

1. จำนวนเงินและชั่วโมงต้องไม่ติดลบ ยกเว้น direction/reversal ที่ออกแบบไว้
2. ห้ามลบรายการ ledger, earning, payout, invoice และ payment แบบ hard delete
3. Approved teacher hour ต้องมี `approved_by`, `approved_at`
4. Rejected teacher hour/payment/leave ต้องมีเหตุผล
5. Paid payout ต้องมี `paid_at`
6. Published course/lesson/resource ต้องมีข้อมูลที่จำเป็นครบ
7. `teacher_guide` ห้ามเปิดให้ Student แม้ course จะเปิด student access
8. Meet URL และข้อมูลธนาคารเป็นข้อมูลจำกัดสิทธิ์
9. เวลาจบคาบต้องมากกว่าเวลาเริ่ม
10. `week_end >= week_start`
11. Invoice ต่อ billing plan ต่อสัปดาห์ต้องไม่ซ้ำ
12. Hour/earning/payment functions ต้อง idempotent

---

## 21. Views และ Materialized Views

### Views

- `teacher_daily_approval_queue` — รายการ submitted ให้ Admin Approve วันนี้
- `teacher_weekly_hour_summary` — สอนแล้ว รอรับรอง และชั่วโมงตามตาราง
- `teacher_weekly_earning_summary` — รายได้ approved/scheduled/paid ต่อรอบ
- `student_hour_balances` — ชั่วโมงซื้อ ใช้ จอง และคงเหลือ
- `student_next_monday_billing` — ยอด/ชั่วโมงที่จะเรียกเก็บรอบถัดไป
- `course_content_summary` — จำนวน level, lesson และ resource

### Materialized views

ยังไม่จำเป็นใน MVP เริ่มด้วย normal view ก่อน หาก ledger โตมากจึงพิจารณา materialized summary พร้อม refresh strategy

---

## 22. Scheduled Jobs

ใช้ Supabase Cron/pg_cron หรือ Scheduled Edge Function

| เวลา | Job |
|---|---|
| ทุก 15 นาที | retry notification/email/LINE ที่ล้มเหลว |
| ทุกวัน 20:00 | แจ้ง Admin รายการชั่วโมงสอนที่ยังรอ Approve |
| ทุกวัน 23:50 | ตรวจ reconciliation session/hour/ledger |
| ทุกวันจันทร์ 00:05 | สร้าง Invoice นักเรียนประจำสัปดาห์ |
| ทุกวันอาทิตย์หลังสิ้นวัน | ปิดรอบรายได้ครูประจำสัปดาห์ |
| ทุกวัน | mark invoice เกินกำหนดและแจ้งเตือน |
| ทุกวัน | archive signed upload ที่หมดอายุ/ไฟล์ orphan |

Cron ต้องยึด timezone `Asia/Bangkok` หรือแปลงเวลาเป็น UTC ให้ชัดเจน

---

## 23. Retention และ PDPA

| ข้อมูล | อายุเก็บเบื้องต้น |
|---|---|
| Audit log การเงิน/สิทธิ์ | 7–10 ปี หรือตามนโยบายบัญชี |
| Invoice/Payment/Payout | ตามกฎหมายภาษีและบัญชี |
| สลิปการชำระ | ตามความจำเป็นทางบัญชี แล้วลบ/ทำลายอย่างปลอดภัย |
| Attendance/ชั่วโมง | ตลอดอายุสัญญา + ระยะข้อพิพาท |
| Notification delivery log | 90–180 วัน |
| ไฟล์บทเรียน | จน archive/delete โดย Admin |
| ผู้ใช้ที่ยกเลิก | anonymize ข้อมูลที่ไม่จำเป็น แต่คง transaction reference |

ต้องมี workflow สำหรับ export, correction, deletion/anonymization และ consent/privacy notice ตาม PDPA

---

## 24. Migration Order แนะนำ

1. Extensions: `pgcrypto`, `citext` และ extension ที่จำเป็น
2. Enum types
3. Organizations และ system settings
4. Profiles, roles, user roles และ profile types
5. Courses, levels, lessons, resources และ access
6. Enrollment และ assignments
7. Class series/session/student
8. Leave requests
9. Packages, invoices, payments และ student hour ledger
10. Teacher rates, hour entries, earning และ payout
11. Notifications และ audit logs
12. Functions/triggers
13. Views
14. Indexes
15. RLS policies
16. Storage buckets/policies
17. Seed roles, organization และ System Owner bootstrap
18. Cron jobs

ทุก migration ต้อง reversible เท่าที่เป็นไปได้ และทดสอบใน staging ก่อน production

---

## 25. ข้อมูลที่ต้องยืนยันก่อนเขียน Migration จริง

1. “ตัดยอดรายได้ครูทุกสัปดาห์” ให้เริ่มวันจันทร์และปิดวันอาทิตย์หรือไม่?
2. วันจ่ายเงินจริงให้ครูคือวันใดหลังตัดยอด?
3. ชั่วโมงที่เหลือของครูหมายถึงชั่วโมงตามตารางในสัปดาห์ หรือโควตาชั่วโมงตามสัญญา?
4. ครูต้องกด “สอนเสร็จ” เอง หรือระบบสร้าง submitted อัตโนมัติหลังจบคาบ?
5. Admin ต้อง Approve ภายในกี่โมงของแต่ละวัน?
6. หาก Admin ไม่ Approve ก่อนปิดรอบ ต้องเลื่อนไปรอบถัดไปหรือหยุดปิดรอบ?
7. นักเรียนจ่ายทุกวันจันทร์แบบย้อนหลังสัปดาห์ก่อน หรือจ่ายล่วงหน้าสำหรับสัปดาห์ใหม่?
8. ราคานักเรียนคิดต่อชั่วโมง รายสัปดาห์ หรือซื้อเป็น package?
9. ชั่วโมงนักเรียนถูกหักเมื่อครู submit, Admin approve หรือหลังคาบ completed?
10. นักเรียนขาดเรียนและยกเลิกกะทันหันต้องหักชั่วโมงหรือไม่?
11. ครูลา/ระบบยกเลิกคาบต้องคืนชั่วโมงอัตโนมัติหรือไม่?
12. Teacher Guide อนุญาตให้ครูดาวน์โหลด หรือดูอย่างเดียว?
13. ใบงานและ PPT อนุญาตให้นักเรียนดาวน์โหลดหรือดูอย่างเดียว?
14. ต้องแยกหลายสาขา/หลายบริษัทในอนาคตหรือไม่?
15. ต้องมีผู้ปกครองเป็นอีก role หรือรับแจ้งเตือนเท่านั้น?

---

## 26. Definition of Done สำหรับ Database

- Migration รันจากฐานข้อมูลว่างได้สำเร็จ
- มี seed สำหรับ organization, roles และ System Owner bootstrap
- ทุกตาราง public เปิด RLS
- Automated test ยืนยันว่า Student อ่าน teacher guide ไม่ได้
- Automated test ยืนยันว่าผู้ใช้ข้ามบัญชีอ่านข้อมูลการเงินกันไม่ได้
- Approve ชั่วโมงสร้าง earning เพียงครั้งเดียวแม้ request ซ้ำ
- Verify payment เพิ่มชั่วโมงนักเรียนเพียงครั้งเดียวแม้ webhook/request ซ้ำ
- Ledger balance ตรงกับ transaction history
- Weekly payout ไม่ดึง earning ซ้ำข้ามรอบ
- Monday invoice ไม่สร้างซ้ำสำหรับ billing plan/week เดียวกัน
- Audit log ครบทุก workflow สำคัญ
- Storage bucket เป็น private และ signed URL หมดอายุได้
- Backup/restore และ migration rollback ผ่านการทดสอบ
- Query สำคัญผ่าน performance test ตามจำนวนผู้ใช้เป้าหมาย
