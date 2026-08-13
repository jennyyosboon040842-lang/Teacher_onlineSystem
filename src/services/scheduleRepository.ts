import { requireSupabase, supabase } from "../lib/supabase";

export interface ScheduleSession {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  meetUrl: string | null;
  teacherId: string | null;
  studentIds: string[];
  teacherName?: string;
  courseName?: string;
  hourEntry?: {
    id: string;
    status: string;
    hoursTaught: number;
    hourlyRate: number | null;
    earningAmount: number | null;
  } | null;
}

export interface TeacherApprovalEntry {
  entryId: string;
  sessionId: string;
  sessionTitle: string;
  teacherName: string;
  teachingDate: string;
  startsAt: string;
  endsAt: string;
  hoursTaught: number;
  status: "submitted" | "approved";
  earningAmount: number | null;
}

export interface TeacherEarningEntry {
  entryId: string;
  sessionId: string;
  sessionTitle: string;
  teachingDate: string;
  hoursTaught: number;
  hourlyRate: number;
  earningAmount: number;
  approvedAt: string;
}

export interface TeacherFinanceSummary {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  teacherLevel: number;
  hourlyRate: number;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  unpaidHours: number;
  unpaidAmount: number;
  periodStart: string;
  periodEnd: string;
  lastPaidAt: string | null;
}

export interface TeacherPayout {
  payoutId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  grossAmount: number;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  paidAt: string;
  teacherConfirmedAt: string | null;
}

export const scheduleRepository = {
  async listTeachers() {
    const client = requireSupabase();
    const detailed = await client
      .from("teacher_profiles")
      .select(
        "user_id, teacher_level, hourly_rate, profiles(display_name, email)",
      )
      .is("archived_at", null);
    const result = detailed.error
      ? await client
          .from("teacher_profiles")
          .select("user_id, profiles(display_name, email)")
          .is("archived_at", null)
      : detailed;
    if (result.error) throw result.error;
    const data = result.data;
    return (data ?? []).map((row) => {
      const profile = row.profiles as unknown as {
        display_name: string | null;
        email: string;
      };
      return {
        id: row.user_id as string,
        name: profile?.display_name || profile?.email || "Teacher",
        level: Number("teacher_level" in row ? (row.teacher_level ?? 1) : 1),
        hourlyRate: Number(
          "hourly_rate" in row ? (row.hourly_rate ?? 100) : 100,
        ),
      };
    });
  },
  async listStudents() {
    const client = requireSupabase();
    const { data, error } = await client
      .from("student_profiles")
      .select("user_id, profiles(display_name, email)")
      .is("archived_at", null);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const profile = row.profiles as unknown as {
        display_name: string | null;
        email: string;
      };
      return {
        id: row.user_id as string,
        name: profile?.display_name || profile?.email || "Student",
      };
    });
  },
  async list(): Promise<ScheduleSession[]> {
    if (!supabase) return [];
    const detailed = await supabase
      .from("class_sessions")
      .select(
        `
        id, title, starts_at, ends_at, status, meet_url, teacher_id,
        courses(name),
        teacher_profiles!class_sessions_teacher_id_fkey(profiles(display_name)),
        teacher_hour_entries(id, status, hours_taught, hourly_rate_snapshot, earning_amount)
      `,
      )
      .order("starts_at");
    const result = detailed.error
      ? await supabase
          .from("class_sessions")
          .select(
            `
            id, title, starts_at, ends_at, status, meet_url, teacher_id,
            courses(name),
            teacher_profiles!class_sessions_teacher_id_fkey(profiles(display_name)),
            teacher_hour_entries(id, status, hours_taught)
          `,
          )
          .order("starts_at")
      : detailed;
    if (result.error) throw result.error;
    const data = result.data;
    const sessionRows = data ?? [];
    const sessionIds = sessionRows.map((row) => row.id as string);
    const memberships = sessionIds.length
      ? await supabase
          .from("class_session_students")
          .select("session_id, student_id")
          .in("session_id", sessionIds)
      : { data: [], error: null };
    if (memberships.error) throw memberships.error;
    return sessionRows.map((row) => {
      const course = row.courses as unknown as { name: string } | null;
      const teacherProfile = row.teacher_profiles as unknown as {
        profiles: { display_name: string } | null;
      } | null;
      const entries = row.teacher_hour_entries as unknown as Array<{
        id: string;
        status: string;
        hours_taught: number;
        hourly_rate_snapshot?: number | null;
        earning_amount?: number | null;
      }>;
      return {
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        meetUrl: row.meet_url,
        teacherId: row.teacher_id,
        studentIds: (memberships.data ?? [])
          .filter((member) => member.session_id === row.id)
          .map((member) => member.student_id as string),
        courseName: course?.name,
        teacherName: teacherProfile?.profiles?.display_name,
        hourEntry: entries?.[0]
          ? {
              id: entries[0].id,
              status: entries[0].status,
              hoursTaught: Number(entries[0].hours_taught),
              hourlyRate:
                entries[0].hourly_rate_snapshot === null
                  ? null
                  : Number(entries[0].hourly_rate_snapshot),
              earningAmount:
                entries[0].earning_amount === null
                  ? null
                  : Number(entries[0].earning_amount),
            }
          : null,
      };
    });
  },

  async create(input: {
    courseId: string;
    teacherId: string;
    studentIds: string[];
    title: string;
    startsAt: string;
    endsAt: string;
    meetUrl: string;
  }) {
    const client = requireSupabase();
    const { data, error } = await client
      .from("class_sessions")
      .insert({
        course_id: input.courseId,
        teacher_id: input.teacherId,
        title: input.title,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        meet_url: input.meetUrl || null,
        meet_visible_from: input.startsAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    const studentIds = [...new Set(input.studentIds)];
    if (studentIds.length) {
      const { error: memberError } = await client
        .from("class_session_students")
        .insert(
          studentIds.map((studentId) => ({
            session_id: data.id,
            student_id: studentId,
          })),
        );
      if (memberError) {
        await client.from("class_sessions").delete().eq("id", data.id);
        throw memberError;
      }
    }
    return data;
  },

  async update(
    id: string,
    input: Partial<{
      title: string;
      startsAt: string;
      endsAt: string;
      meetUrl: string;
      studentIds: string[];
      teacherId: string | null;
    }>,
  ) {
    const client = requireSupabase();
    const patch: Record<string, string | null> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
    if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
    if (input.meetUrl !== undefined) patch.meet_url = input.meetUrl || null;
    if (input.teacherId !== undefined) patch.teacher_id = input.teacherId;
    const { error } = await client
      .from("class_sessions")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    if (input.studentIds !== undefined) {
      const studentIds = [...new Set(input.studentIds)];
      const { error: deleteError } = await client
        .from("class_session_students")
        .delete()
        .eq("session_id", id);
      if (deleteError) throw deleteError;
      if (studentIds.length) {
        const { error: insertError } = await client
          .from("class_session_students")
          .insert(
            studentIds.map((studentId) => ({
              session_id: id,
              student_id: studentId,
            })),
          );
        if (insertError) throw insertError;
      }
    }
  },

  async deleteSession(id: string) {
    const client = requireSupabase();
    const { error } = await client.from("class_sessions").delete().eq("id", id);
    if (error) throw error;
  },

  async unassignTeacher(id: string) {
    const client = requireSupabase();
    const { error } = await client.rpc("unassign_teacher_from_session", {
      target_session_id: id,
    });
    if (!error) return;

    const rpcUnavailable =
      error.code === "PGRST202" ||
      error.message.includes("schema cache") ||
      error.message.includes("Could not find the function");
    if (rpcUnavailable) {
      const { error: updateError } = await client
        .from("class_sessions")
        .update({ teacher_id: null })
        .eq("id", id);
      if (!updateError) return;
      if (
        updateError.message.includes("not-null") ||
        updateError.message.includes("null value")
      )
        throw new Error(
          "ฐานข้อมูลยังบังคับให้คาบต้องมีครู กรุณารัน migration 012 แล้วรีโหลดหน้าเว็บ",
        );
      throw updateError;
    }
    if (error.message.includes("session_has_teaching_record"))
      throw new Error("คาบนี้มีประวัติการสอนแล้ว จึงนำครูออกไม่ได้");
    throw error;
  },

  async notifySchedule(sessionId: string) {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke(
      "notify-class-schedule",
      { body: { sessionId } },
    );
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async submitCompletion(sessionId: string, note?: string) {
    const client = requireSupabase();
    const { data, error } = await client.rpc("submit_teaching_completion", {
      target_session_id: sessionId,
      teacher_note: note ?? null,
    });
    if (error) throw error;
    return data;
  },

  async approveHours(entryId: string, note?: string) {
    const client = requireSupabase();
    const { data, error } = await client.rpc("approve_teacher_hours", {
      target_entry_id: entryId,
      admin_note: note ?? null,
    });
    if (error) throw error;
    return data;
  },
  async listTeacherApprovalQueue(): Promise<TeacherApprovalEntry[]> {
    const client = requireSupabase();
    const { data, error } = await client.rpc("get_teacher_approval_queue");
    if (error) throw error;
    return (data ?? []).map(
      (row: {
        entry_id: string;
        session_id: string;
        session_title: string;
        teacher_name: string;
        teaching_date: string;
        starts_at: string;
        ends_at: string;
        hours_taught: number;
        entry_status: "submitted" | "approved";
        earning_amount: number | null;
      }) => ({
        entryId: row.entry_id,
        sessionId: row.session_id,
        sessionTitle: row.session_title,
        teacherName: row.teacher_name,
        teachingDate: row.teaching_date,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        hoursTaught: Number(row.hours_taught),
        status: row.entry_status,
        earningAmount:
          row.earning_amount === null ? null : Number(row.earning_amount),
      }),
    );
  },
  async listMyTeacherEarnings(): Promise<TeacherEarningEntry[]> {
    const client = requireSupabase();
    const { data, error } = await client.rpc("get_my_teacher_earnings");
    if (error) throw error;
    return (data ?? []).map(
      (row: {
        entry_id: string;
        session_id: string;
        session_title: string;
        teaching_date: string;
        hours_taught: number;
        hourly_rate: number;
        earning_amount: number;
        approved_at: string;
      }) => ({
        entryId: row.entry_id,
        sessionId: row.session_id,
        sessionTitle: row.session_title,
        teachingDate: row.teaching_date,
        hoursTaught: Number(row.hours_taught),
        hourlyRate: Number(row.hourly_rate),
        earningAmount: Number(row.earning_amount),
        approvedAt: row.approved_at,
      }),
    );
  },
  async listTeacherFinance(): Promise<TeacherFinanceSummary[]> {
    const client = requireSupabase();
    const { data, error } = await client.rpc("get_admin_teacher_finance");
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      teacherId: String(row.teacher_id),
      teacherName: String(row.teacher_name),
      teacherEmail: String(row.teacher_email),
      teacherLevel: Number(row.teacher_level),
      hourlyRate: Number(row.hourly_rate),
      bankName: String(row.bank_name ?? ""),
      bankAccountName: String(row.bank_account_name ?? ""),
      bankAccountNumber: String(row.bank_account_number ?? ""),
      unpaidHours: Number(row.unpaid_hours),
      unpaidAmount: Number(row.unpaid_amount),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      lastPaidAt: row.last_paid_at ? String(row.last_paid_at) : null,
    }));
  },
  async updateTeacherBank(
    teacherId: string,
    input: { bankName: string; accountName: string; accountNumber: string },
  ) {
    const client = requireSupabase();
    const { error } = await client.rpc("update_teacher_bank", {
      target_teacher_id: teacherId,
      target_bank_name: input.bankName,
      target_account_name: input.accountName,
      target_account_number: input.accountNumber,
    });
    if (error) throw error;
  },
  async markTeacherPaid(teacherId: string, note?: string) {
    const client = requireSupabase();
    const { data, error } = await client.rpc("mark_teacher_payout_paid", {
      target_teacher_id: teacherId,
      payment_note: note ?? null,
    });
    if (error) throw error;
    return data;
  },
  async listMyTeacherPayouts(): Promise<TeacherPayout[]> {
    const client = requireSupabase();
    const { data, error } = await client.rpc("get_my_teacher_payouts");
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      payoutId: String(row.payout_id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      totalHours: Number(row.total_hours),
      grossAmount: Number(row.gross_amount),
      bankName: String(row.bank_name ?? ""),
      bankAccountName: String(row.bank_account_name ?? ""),
      bankAccountNumber: String(row.bank_account_number ?? ""),
      paidAt: String(row.paid_at),
      teacherConfirmedAt: row.teacher_confirmed_at
        ? String(row.teacher_confirmed_at)
        : null,
    }));
  },
  async confirmPayoutReceived(payoutId: string, note?: string) {
    const client = requireSupabase();
    const { data, error } = await client.rpc(
      "confirm_teacher_payout_received",
      { target_payout_id: payoutId, confirmation_note: note ?? null },
    );
    if (error) throw error;
    return data;
  },
  async setTeacherLevel(teacherId: string, level: 1 | 2 | 3) {
    const client = requireSupabase();
    const { data, error } = await client.rpc("set_teacher_level", {
      target_teacher_id: teacherId,
      target_level: level,
    });
    if (error) throw error;
    return data;
  },
};
