import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization)
      return response({ error: "missing_authorization" }, 401);

    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userError } = await client.auth.getUser(
      authorization.replace("Bearer ", ""),
    );
    if (userError || !userData.user)
      return response({ error: "invalid_session" }, 401);

    const { data: adminRole } = await client
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .eq("role_code", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    if (!adminRole) return response({ error: "permission_denied" }, 403);

    const { sessionId } = (await request.json()) as { sessionId?: string };
    if (!sessionId) return response({ error: "session_id_required" }, 400);

    const { data: session, error: sessionError } = await client
      .from("class_sessions")
      .select(
        `
        title, starts_at, ends_at, meet_url,
        courses(name),
        teacher_profiles!class_sessions_teacher_id_fkey(profiles(display_name, email)),
        class_session_students(student_profiles!class_session_students_student_id_fkey(profiles(display_name, email)))
      `,
      )
      .eq("id", sessionId)
      .single();
    if (sessionError) throw sessionError;

    const teacher = session.teacher_profiles?.profiles;
    const students = (session.class_session_students ?? [])
      .map(
        (item: {
          student_profiles?: {
            profiles?: { display_name?: string; email?: string };
          };
        }) => item.student_profiles?.profiles,
      )
      .filter(Boolean);
    const recipients = [teacher, ...students].filter(
      (item): item is { display_name?: string; email: string } =>
        Boolean(item?.email),
    );
    const uniqueEmails = [...new Set(recipients.map((item) => item.email))];
    if (!uniqueEmails.length) return response({ sent: 0 });

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("SCHEDULE_EMAIL_FROM");
    if (!apiKey || !from)
      return response({ error: "email_secrets_not_configured" }, 503);

    const start = new Date(session.starts_at).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
    });
    const end = new Date(session.ends_at).toLocaleTimeString("th-TH", {
      timeZone: "Asia/Bangkok",
    });
    const courseName = session.courses?.name ?? "ไม่ระบุรายวิชา";
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
        <h2 style="color:#0284c7">Speak & Explor English</h2>
        <p>มีการเพิ่มหรือแก้ไขตารางเรียนของคุณ</p>
        <p><strong>${session.title}</strong><br>${courseName}<br>${start} – ${end}</p>
        ${session.meet_url ? `<p><a href="${session.meet_url}" style="background:#0284c7;color:white;padding:10px 16px;border-radius:8px;text-decoration:none">เข้าสู่ห้องเรียน</a></p>` : ""}
        <p style="font-size:12px;color:#64748b">เข้าสู่ระบบเพื่อดูตารางล่าสุด</p>
      </div>`;

    const mailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: uniqueEmails,
        subject: `แจ้งตารางเรียน: ${session.title}`,
        html,
      }),
    });
    if (!mailResponse.ok)
      throw new Error(`email_provider_error: ${await mailResponse.text()}`);
    return response({ sent: uniqueEmails.length });
  } catch (error) {
    return response(
      { error: error instanceof Error ? error.message : "unknown_error" },
      400,
    );
  }
});
