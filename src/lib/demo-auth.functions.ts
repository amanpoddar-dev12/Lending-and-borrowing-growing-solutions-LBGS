import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const roleSchema = z.enum(["admin", "employee", "client"]);

const DEMO_EMAILS: Record<z.infer<typeof roleSchema>, string> = {
  admin: "demo.admin@demo.lbgs.local",
  employee: "demo.employee@demo.lbgs.local",
  client: "demo.client@demo.lbgs.local",
};

const DEMO_NAMES: Record<z.infer<typeof roleSchema>, string> = {
  admin: "Demo Admin",
  employee: "Demo Employee",
  client: "Demo Client",
};

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "P!" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "Aa9";
}

/**
 * Demo sign-in for testing without SMS. Creates the demo account on first use
 * (with the requested role), then rotates a one-shot password and mints a
 * session, mirroring the OTP verify flow.
 */
export const demoSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ role: roleSchema }).parse(data))
  .handler(async ({ data }) => {
    const role = data.role;
    const email = DEMO_EMAILS[role];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find existing demo user by listing and matching email (small user base).
    let userId: string | null = null;
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) throw new Error(listErr.message);
    const existing = list.users.find((u) => u.email === email);

    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { name: DEMO_NAMES[role] },
      });
      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? "Failed to create demo account");
      }
      userId = created.user.id;
    }

    // Ensure exactly the requested role (handle_new_user defaults to client).
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).neq("role", role);
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!(roleRows ?? []).length) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (roleErr) throw new Error(roleErr.message);
    }

    // Pre-fill the profile so the "Complete your profile" screen is skipped.
    const demoPhone = { admin: "+919000000001", employee: "+919000000002", client: "+919000000003" }[role];
    await supabaseAdmin
      .from("profiles")
      .update({ name: DEMO_NAMES[role], phone: demoPhone })
      .eq("id", userId);

    if (role === "client") {
      const { data: c } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      const clientValues = {
        business_name: "Demo Traders Pvt Ltd",
        gst_number: "27ABCDE1234F1Z5",
        contact_person: DEMO_NAMES.client,
        email,
        phone: demoPhone,
      };
      if (c?.id) {
        await supabaseAdmin.from("clients").update(clientValues).eq("id", c.id);
      } else {
        const { error: cErr } = await supabaseAdmin
          .from("clients")
          .insert({ user_id: userId, ...clientValues });
        if (cErr) throw new Error(cErr.message);
      }
    } else {
      // Remove any stray client record created while the account defaulted to client.
      await supabaseAdmin.from("clients").delete().eq("user_id", userId);
    }

    // Rotate to a one-shot password and sign in to mint a session.
    const password = randomPassword();
    const { data: updated, error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
    });
    if (updErr) throw new Error(updErr.message);
    if (!updated.user?.email) throw new Error("Demo account is missing an email.");

    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({
      email: updated.user.email,
      password,
    });
    if (signInErr || !signIn.session) {
      throw new Error(signInErr?.message ?? "Failed to sign in");
    }

    return {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    };
  });
