import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const roleSchema = z.enum(["admin", "employee", "client"]);
const inputSchema = z.object({ role: roleSchema });

const DEMO_PASSWORD = "Demo1234!";
const DEMO_ACCOUNTS: Record<
  "admin" | "employee" | "client",
  { email: string; name: string; phone: string }
> = {
  admin: { email: "admin@demo.com", name: "Demo Admin", phone: "+15555550101" },
  employee: { email: "employee@demo.com", name: "Demo Employee", phone: "+15555550102" },
  client: { email: "client@demo.com", name: "Demo Client", phone: "+15555550103" },
};

/**
 * Dev-only: ensures a demo user exists for the given role, then returns a
 * fresh session. This is disabled in production and must never be enabled
 * in any non-local environment.
 */
export const demoSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    // CRITICAL: Only allow demo sign-in in development with explicit opt-in
    const isDemoEnabled = process.env.VITE_ENABLE_DEMO_AUTH === "true";
    const isDevelopment = process.env.NODE_ENV === "development";
    
    if (!isDemoEnabled || !isDevelopment) {
      throw new Error("Demo authentication is not enabled in this environment.");
    }

    const acct = DEMO_ACCOUNTS[data.role];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or create the user.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    let user = list?.users?.find((u) => u.email === acct.email) ?? null;

    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: acct.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        phone: acct.phone,
        phone_confirm: true,
        user_metadata: { name: acct.name, phone: acct.phone },
      });
      if (error || !created.user) throw new Error(error?.message ?? "Failed to create demo user");
      user = created.user;
    } else {
      // Ensure password is the known demo password.
      await supabaseAdmin.auth.admin.updateUserById(user.id, { password: DEMO_PASSWORD });
    }

    // Ensure the correct role is assigned (trigger defaults to 'client').
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", user.id);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: user.id, role: data.role });

    // Ensure profile has the phone (so phone-role login also works for demos).
    await supabaseAdmin
      .from("profiles")
      .update({ phone: acct.phone, name: acct.name })
      .eq("id", user.id);

    // Mint a session via password sign-in.
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({
      email: acct.email,
      password: DEMO_PASSWORD,
    });
    if (signInErr || !signIn.session) throw new Error(signInErr?.message ?? "Sign in failed");

    return {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      role: data.role,
    };
  });
