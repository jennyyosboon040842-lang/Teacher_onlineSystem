import { requireSupabase } from "../lib/supabase";

async function functionErrorMessage(error: unknown) {
  const context = (error as { context?: Response })?.context;
  if (context) {
    try {
      const payload = (await context.clone().json()) as { error?: string };
      if (payload.error) {
        const known: Record<string, string> = {
          permission_denied: "บัญชีนี้ไม่มีสิทธิ์ Admin สำหรับเพิ่มผู้ใช้",
          invalid_session: "Session หมดอายุ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่",
          missing_authorization: "ไม่พบ Session กรุณาเข้าสู่ระบบใหม่",
          email_and_name_required: "กรุณากรอกชื่อและอีเมลให้ครบ",
          user_already_exists: "อีเมลนี้มีบัญชีอยู่ในระบบแล้ว",
        };
        return known[payload.error] ?? payload.error;
      }
    } catch {
      // Fall back to the SDK message below.
    }
  }
  const message = error instanceof Error ? error.message : "unknown_error";
  if (message.includes("Failed to send a request"))
    return "เชื่อมต่อระบบเพิ่มผู้ใช้ไม่ได้ กรุณาตรวจว่า Deploy Edge Function แล้ว";
  if (message.includes("non-2xx"))
    return "Edge Function ปฏิเสธคำขอ กรุณาตรวจสิทธิ์ Admin และ Function logs";
  return message;
}

export const adminService = {
  async inviteUser(input: {
    email: string;
    displayName: string;
    role: "teacher" | "student";
  }) {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke(
      "admin-invite-teacher",
      {
        body: { action: "invite", ...input },
      },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error);
    return data as { id: string; email: string };
  },
  async deleteUser(userId: string) {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke(
      "admin-invite-teacher",
      { body: { action: "delete", userId } },
    );
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(data.error);
  },
};
