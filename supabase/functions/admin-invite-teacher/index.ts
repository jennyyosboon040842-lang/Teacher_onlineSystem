import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("missing_authorization");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authorization.replace("Bearer ", "");
    const { data: userData, error: userError } =
      await adminClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("invalid_session");

    const { data: role } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .eq("role_code", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    if (!role)
      return new Response(JSON.stringify({ error: "permission_denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const body = (await request.json()) as {
      action?: string;
      email?: string;
      displayName?: string;
      role?: string;
      userId?: string;
    };
    if (body.action === "delete") {
      if (!body.userId) throw new Error("user_id_required");
      if (body.userId === userData.user.id)
        throw new Error("cannot_delete_yourself");
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(
        body.userId,
      );
      if (deleteError) throw deleteError;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const email = body.email?.trim().toLowerCase();
    const displayName = body.displayName?.trim();
    const requestedRole = body.role === "student" ? "student" : "teacher";
    if (!email || !displayName)
      return new Response(
        JSON.stringify({ error: "email_and_name_required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { display_name: displayName, requested_role: requestedRole },
        redirectTo: `${request.headers.get("origin") ?? ""}`,
      },
    );
    if (error) throw error;
    return new Response(
      JSON.stringify({ id: data.user.id, email: data.user.email }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "unknown_error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
