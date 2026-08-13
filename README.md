# Speak & Explor English

UI prototype สำหรับตั้งค่ารายวิชา ครู และนักเรียน ออกแบบตาม [PRD.md](./PRD.md) โดยระบบเริ่มต้นแบบไม่มีข้อมูลตัวอย่าง

## Tech stack

- React 19
- TypeScript 7 (strict mode)
- Vite 8
- Tailwind CSS 4 ผ่าน Vite plugin
- Lucide React icons
- เตรียม environment variables สำหรับ Supabase แต่ยังไม่มีการเชื่อมต่อ backend

บัญชีเจ้าของระบบที่กำหนดไว้สำหรับเชื่อม Supabase Auth คือ `jenny.yosboon040842@gmail.com`

## เริ่มต้นใช้งาน

```bash
npm install
npm run dev
```

เปิด `http://localhost:5173`

## คำสั่งตรวจสอบ

```bash
npm run typecheck
npm run build
npm run preview
```

## การใช้งาน UI prototype

- ระบบเริ่มต้นด้วยข้อมูลว่าง ไม่มีรายวิชา ครู นักเรียน หรือข้อมูลจำลอง
- Admin สร้างรายวิชาและกำหนดคำอธิบายเองได้
- ภายในรายวิชาสามารถเพิ่ม Level ได้ไม่จำกัด
- ภายในแต่ละ Level สามารถเพิ่ม Lesson ได้ไม่จำกัด
- ภายใน Lesson เพิ่มใบงาน, PowerPoint, ไฟล์เสียง และคู่มือครูได้
- Student เห็นเฉพาะใบงาน, PowerPoint และไฟล์เสียง
- Teacher เห็นสื่อของนักเรียนพร้อมคู่มือครูเพิ่มเติม
- Teacher เห็นชั่วโมงสอนแล้ว ชั่วโมงที่ยังเหลือ และรายได้ที่ตัดยอดทุกสัปดาห์
- Admin มีหน้ารับรอง (Approve) ชั่วโมงสอนของครูประจำวัน
- Student เห็นชั่วโมงที่ชำระแล้ว ชั่วโมงใช้ไป และชั่วโมงคงเหลือ
- กำหนดรอบชำระของ Student เป็นทุกวันจันทร์
- Admin เปิดสิทธิ์ดูรายวิชาแยกสำหรับ Teacher และ Student
- ต้องกดเผยแพร่รายวิชาก่อน รายวิชาจึงปรากฏในมุมมองที่ได้รับสิทธิ์
- Admin ลบรายวิชา Level และ Lesson ได้จากหน้า Course Builder
- มีหน้า empty state สำหรับครู นักเรียน และการตั้งค่าองค์กร

ใช้ตัวเลือก `Admin view / Teacher view / Student view` ที่แถบด้านบนเพื่อทดลองสิทธิ์แต่ละบทบาท ข้อมูลที่สร้างเก็บใน React state ชั่วคราวและจะกลับเป็นระบบว่างเมื่อ refresh หน้าเว็บ จนกว่าจะเชื่อม Supabase

## Supabase (ระยะถัดไป)

คัดลอก `.env.example` เป็น `.env.local` และเติมค่าต่อไปนี้เมื่อเริ่มเชื่อม backend:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

ก่อนเชื่อมจริงควรแยก UI ปัจจุบันเป็น feature modules, สร้าง Supabase client, schema/migrations, Row Level Security ตาม role และ storage policies สำหรับสลิปและสื่อ private

### เริ่มเชื่อมต่อ Supabase

โปรเจกต์มี Supabase client, Auth service, Course repository, private file upload และ core migration แล้ว

1. สร้าง Supabase project
2. คัดลอก `.env.example` เป็น `.env.local`
3. ใส่ Project URL และ Publishable/Anon key (ห้ามใส่ `service_role` ใน frontend)
4. Link โปรเจกต์ด้วย Supabase CLI
5. รัน migration:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

6. สร้างบัญชี Auth ด้วยอีเมล `jenny.yosboon040842@gmail.com` ระบบจะกำหนด Admin role ให้ผ่าน database trigger
7. รัน `npm run dev` และตรวจแถบสถานะ Supabase บนหน้าเว็บ

หลัง Login ระบบอ่าน role ที่ยัง active จาก `public.user_roles` โดยตรง ผู้ใช้ไม่สามารถสลับ role เองจากหน้าเว็บได้ เมนูถูกจำกัดดังนี้:

- Admin: ภาพรวม รายวิชา ครู นักเรียน รับรองชั่วโมง และตั้งค่าระบบ
- Teacher: หน้าแรก รายวิชาที่ได้รับสิทธิ์ ชั่วโมงและรายได้
- Student: หน้าแรก รายวิชาของฉัน ชั่วโมงเรียนของฉัน

บัญชีที่ไม่มี role, ถูกถอน role หรือ profile ไม่อยู่สถานะ `active` จะถูกปฏิเสธการเข้าใช้งาน และ RLS จะตรวจสิทธิ์ซ้ำในระดับฐานข้อมูล

### สมัครสมาชิก Teacher และ Student

หน้า Auth มีแท็บ `สมัครสมาชิก` ให้เลือกสมัครเป็น Teacher หรือ Student เท่านั้น ระบบไม่รับค่า Admin จาก self-registration เมื่อสมัครสำเร็จ database trigger จะสร้าง profile, role และรหัส Teacher/Student ให้อัตโนมัติ

หลังจากใช้ migration แรกแล้ว ให้นำ migration นี้ไปรันเพิ่มใน Supabase SQL Editor:

```text
supabase/migrations/202608110002_teacher_student_signup.sql
```

หากเปิด Confirm Email ใน Supabase ผู้สมัครต้องยืนยันอีเมลก่อนเข้าสู่ระบบ

### ตารางสอนและการรับรองว่าสอนเสร็จ

นำ migration ต่อไปนี้ไปรันใน Supabase SQL Editor:

```text
supabase/migrations/202608110003_schedule_and_teaching_hours.sql
```

Migration นี้เพิ่มตารางสอน, นักเรียนในคาบ, Google Meet link, รายการชั่วโมงสอน และ RPC สำหรับ Teacher ส่งสถานะสอนเสร็จกับ Admin Approve โดยมี RLS แยกตามผู้เกี่ยวข้องในคาบ

### Admin เพิ่มและมอบหมายครู

ระบบใช้ Supabase Edge Function เพื่อให้ Admin ส่งคำเชิญสร้างบัญชีครูโดยไม่เปิดเผย service-role key ใน browser หลัง link Supabase project แล้วให้ deploy:

```bash
supabase functions deploy admin-invite-teacher
```

Supabase จะให้ `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` กับ Edge Function ใน environment โดยอัตโนมัติ ไม่ต้องนำ service-role key มาใส่ใน `.env.local`

หลังครูตอบรับคำเชิญ:

1. ครูจะปรากฏในเมนู `ครูผู้สอน`
2. Admin เปิดรายวิชาและเลือกครูในส่วน `มอบหมายรายวิชาและไฟล์ให้ครู`
3. ครูที่ได้รับมอบหมายเท่านั้นจึงเห็น Lesson, ไฟล์ และคู่มือครู
4. ครูจะปรากฏในตัวเลือกสร้างตารางสอน
5. ตาราง เวลา และ Google Meet link ที่ Admin บันทึกจะแสดงในหน้าตารางของครู

### Private file preview

ไฟล์ที่ Admin อัปโหลดเปิดดูผ่าน modal ภายในเว็บ ระบบตรวจ RLS แล้วสร้าง Supabase Storage signed URL อายุ 2 นาที รองรับ PDF/เอกสาร, PowerPoint `.pptx` และไฟล์เสียง โดยซ่อนปุ่มดาวน์โหลดและปิด context menu เท่าที่ browser รองรับ PowerPoint ถูก render ภายใน browser โดยตรงและไม่ส่งไฟล์ไปยัง Office Viewer ภายนอก

ข้อจำกัด: Browser ต้องได้รับข้อมูลไฟล์เพื่อแสดงผล จึงไม่สามารถป้องกันการบันทึกหน้าจอหรือดึงข้อมูลด้วยเครื่องมือภายนอกได้ 100% Signed URL, private bucket และ RLS ช่วยป้องกันการเข้าถึงทั่วไปและลิงก์ถาวร

หากอัปโหลดไฟล์ไม่ได้หลังใช้ migration เดิม ให้นำ migration นี้ไปรันเพิ่มใน Supabase SQL Editor:

```text
supabase/migrations/202608110004_fix_lesson_resource_upload.sql
```

Migration จะอัปเดต private bucket ให้รองรับ MIME ของ PDF, Word, Excel, PPT/PPTX และ audio พร้อมเพิ่มขนาดสูงสุดเป็น 200 MB และสร้าง upload policies ที่ขาดอยู่โดยไม่ลบไฟล์เดิม

หากอัปโหลดสำเร็จแต่กดเปิดแล้วขึ้นว่าไม่มีสิทธิ์ ให้รัน migration แก้ private preview:

```text
supabase/migrations/202608110005_fix_private_file_preview.sql
```

Migration นี้เพิ่ม Admin Storage SELECT policy และ view ตรวจสอบว่า record ใน `lesson_resources` มี object จริงใน Storage หรือไม่

Migration ชุดแรกอยู่ที่ `supabase/migrations/202608110001_core_learning.sql` ครอบคลุมบัญชี/บทบาท, Course, Level, Lesson, resource, enrollment, assignment, RLS และ private Storage bucket
