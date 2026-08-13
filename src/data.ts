export type Role = 'admin' | 'teacher' | 'student'
export type Page = 'dashboard' | 'schedule' | 'people' | 'leave' | 'lessons' | 'payments' | 'earnings' | 'reports' | 'settings'

export const roleLabels: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  teacher: 'ครูผู้สอน',
  student: 'นักเรียน',
}

export const sessions = [
  { id: 1, time: '09:00', end: '10:00', subject: 'ภาษาอังกฤษเพื่อการสื่อสาร', teacher: 'Teacher May', student: 'น้องแพรว', room: 'Google Meet', color: 'blue', status: 'กำลังจะเริ่ม' },
  { id: 2, time: '10:30', end: '11:30', subject: 'Grammar in Daily Life', teacher: 'Teacher Anna', student: 'น้องต้นกล้า', room: 'Google Meet', color: 'violet', status: 'ยืนยันแล้ว' },
  { id: 3, time: '13:00', end: '14:00', subject: 'English for Kids', teacher: 'Teacher May', student: 'กลุ่ม Little Stars', room: 'Google Meet', color: 'orange', status: 'ยืนยันแล้ว' },
  { id: 4, time: '15:30', end: '16:30', subject: 'Conversation Practice', teacher: 'Teacher John', student: 'น้องธีร์', room: 'Google Meet', color: 'teal', status: 'ยืนยันแล้ว' },
]

export const weekDays = [
  { day: 'จ.', date: 10, active: false, count: 3 },
  { day: 'อ.', date: 11, active: true, count: 4 },
  { day: 'พ.', date: 12, active: false, count: 2 },
  { day: 'พฤ.', date: 13, active: false, count: 5 },
  { day: 'ศ.', date: 14, active: false, count: 3 },
  { day: 'ส.', date: 15, active: false, count: 2 },
  { day: 'อา.', date: 16, active: false, count: 0 },
]

export const teachers = [
  { name: 'เมธาวี สุขใจ', nick: 'Teacher May', email: 'may@classflow.ac.th', subject: 'English Conversation', classes: 28, status: 'พร้อมสอน', initials: 'MM', color: 'blue' },
  { name: 'Anna Wilson', nick: 'Teacher Anna', email: 'anna@classflow.ac.th', subject: 'Grammar & Writing', classes: 24, status: 'พร้อมสอน', initials: 'AW', color: 'violet' },
  { name: 'John Carter', nick: 'Teacher John', email: 'john@classflow.ac.th', subject: 'Business English', classes: 19, status: 'พร้อมสอน', initials: 'JC', color: 'orange' },
  { name: 'ศิริพร แสงทอง', nick: 'Teacher Ploy', email: 'ploy@classflow.ac.th', subject: 'English for Kids', classes: 16, status: 'ลาพัก', initials: 'SP', color: 'teal' },
]

export const students = [
  { name: 'พิมพ์ชนก วัฒนะ', nick: 'น้องแพรว', course: 'English Conversation', credits: 8, total: 12, due: '25 ส.ค. 2569', initials: 'พว' },
  { name: 'กฤตเมธ ธีรชัย', nick: 'น้องต้นกล้า', course: 'Grammar in Daily Life', credits: 4, total: 10, due: '18 ส.ค. 2569', initials: 'กธ' },
  { name: 'ธีรภัทร สมบูรณ์', nick: 'น้องธีร์', course: 'Conversation Practice', credits: 7, total: 8, due: '30 ส.ค. 2569', initials: 'ธส' },
]

export const lessons = [
  { id: 1, unit: 'Unit 04', title: 'At the restaurant', description: 'เรียนรู้บทสนทนาและคำศัพท์ที่ใช้ในร้านอาหาร', progress: 72, items: 6, duration: '45 นาที', color: 'blue', current: true },
  { id: 2, unit: 'Unit 05', title: 'Asking for directions', description: 'การถามและบอกเส้นทางในสถานการณ์จริง', progress: 18, items: 5, duration: '40 นาที', color: 'violet', current: false },
  { id: 3, unit: 'Unit 06', title: 'My daily routine', description: 'เล่ากิจวัตรประจำวันด้วย Present Simple', progress: 0, items: 7, duration: '55 นาที', color: 'orange', current: false },
]

export const payments = [
  { id: 'INV-2569-0814', name: 'กฤตเมธ ธีรชัย', package: 'Grammar 10 คาบ', amount: '4,500', submitted: '11 ส.ค. 2569 · 08:42', status: 'รอตรวจสอบ' },
  { id: 'INV-2569-0813', name: 'พิมพ์ชนก วัฒนะ', package: 'Conversation 12 คาบ', amount: '5,900', submitted: '10 ส.ค. 2569 · 19:10', status: 'ชำระแล้ว' },
  { id: 'INV-2569-0812', name: 'ธีรภัทร สมบูรณ์', package: 'Speaking 8 คาบ', amount: '3,900', submitted: '10 ส.ค. 2569 · 14:25', status: 'ไม่ผ่าน' },
  { id: 'INV-2569-0811', name: 'ณิชารีย์ มั่นคง', package: 'Kids English 12 คาบ', amount: '5,400', submitted: '09 ส.ค. 2569 · 11:05', status: 'ชำระแล้ว' },
]

export const leaveRequests = [
  { name: 'เมธาวี สุขใจ', date: '14 ส.ค. 2569', type: 'ลากิจ', sessions: 3, reason: 'ทำธุระสำคัญกับครอบครัว', status: 'รออนุมัติ', initials: 'MM' },
  { name: 'ศิริพร แสงทอง', date: '18–19 ส.ค. 2569', type: 'ลาป่วย', sessions: 5, reason: 'เข้ารับการตรวจสุขภาพ', status: 'อนุมัติแล้ว', initials: 'SP' },
  { name: 'John Carter', date: '22 ส.ค. 2569', type: 'ลากิจ', sessions: 2, reason: 'Visa appointment', status: 'ปฏิเสธ', initials: 'JC' },
]
