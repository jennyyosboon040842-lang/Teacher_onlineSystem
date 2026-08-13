import { requireSupabase, supabase } from "../lib/supabase";

export const authService = {
  async getSession() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async signInWithEmail(email: string, password: string) {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signUp(input: {
    email: string;
    password: string;
    displayName: string;
    role: "teacher" | "student";
  }) {
    const client = requireSupabase();
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: input.displayName,
          requested_role: input.role,
        },
      },
    });
    if (error) throw error;
    return data;
  },

  async requestPasswordReset(email: string) {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  async signOut() {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  async getCurrentAccess(userId: string) {
    const client = requireSupabase();
    const [profileResult, rolesResult] = await Promise.all([
      client
        .from("profiles")
        .select("id, email, display_name, status")
        .eq("id", userId)
        .single(),
      client
        .from("user_roles")
        .select("role_code")
        .eq("user_id", userId)
        .is("revoked_at", null),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (rolesResult.error) throw rolesResult.error;
    return {
      profile: profileResult.data as {
        id: string;
        email: string;
        display_name: string | null;
        status: "invited" | "active" | "suspended" | "archived";
      },
      roles: (rolesResult.data ?? []).map((row) => row.role_code) as Array<
        "admin" | "teacher" | "student"
      >,
    };
  },
};
