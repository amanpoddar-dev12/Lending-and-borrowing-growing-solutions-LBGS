import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { IN_PHONE_REGEX, IN_PHONE_MESSAGE, normalizeIndianPhone } from "@/lib/phone";

// Indian mobiles only: +91 followed by exactly 10 digits.
// Loose input is normalised first so the frontend/backend rules match exactly.
const phoneSchema = z
  .string()
  .trim()
  .transform(normalizeIndianPhone)
  .refine((v) => IN_PHONE_REGEX.test(v), IN_PHONE_MESSAGE);

const roleSchema = z.enum(["admin", "employee", "client"]);

const sendSchema = z.object({
  phone: phoneSchema,
  role: roleSchema,
});

const verifySchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().min(4).max(10),
  role: roleSchema,
});

function syntheticEmail(phone: string) {
  const clean = phone.replace(/[^0-9]/g, "");
  return `phone.${clean}@phone.kredix.local`;
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "P!" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "Aa9";
}

async function findProfileByPhone(phone: string): Promise<{ id: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  return data ? { id: data.id as string } : null;
}

async function getRoles(userId: string): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r: any) => r.role));
}

async function findClientRowByPhone(phone: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id, user_id, contact_person, business_name")
    .eq("phone", phone)
    .maybeSingle();
  return data as { id: string; user_id: string | null; contact_person: string | null; business_name: string | null } | null;
}

/**
 * Validate (phone, role) is eligible to sign in, then send an OTP via Twilio Verify.
 * - admin/employee: phone must be attached to a profile that has the given role.
 * - client: phone must belong to a profile with the client role, OR to a
 *   pre-created client record (auto-provisioned on first successful verify).
 */
export const sendOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data }) => {
    const existing = await findProfileByPhone(data.phone);

    if (data.role === "client") {
      let allowed = false;
      if (existing) {
        const roles = await getRoles(existing.id);
        allowed = roles.has("client");
      }
      if (!allowed) {
        const clientRow = await findClientRowByPhone(data.phone);
        allowed = !!clientRow;
      }
      if (!allowed) {
        throw new Error(
          "This phone number is not registered as a client. Please contact your account manager.",
        );
      }
    } else {
      if (!existing) {
        throw new Error(
          `This phone number is not registered as ${data.role}. Please contact an administrator.`,
        );
      }
      const roles = await getRoles(existing.id);
      if (!roles.has(data.role)) {
        throw new Error(
          `This phone number is not registered as ${data.role}.`,
        );
      }
    }

    // App-managed OTP delivered via Pearl SMS.
    const store = await import("@/lib/otp/otp-store.server");
    const pearl = await import("@/lib/otp/pearl-sms.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    await store.assertCanSend(data.phone, ip);
    const otp = store.generateOtp();
    await store.storeOtp(data.phone, otp);
    try {
      await pearl.sendPearlOtp(data.phone, otp);
    } catch (e) {
      await store.discardOtp(data.phone).catch(() => {});
      throw e;
    }
    await store.recordSend(data.phone, ip);
    return { ok: true };
  });

/**
 * Verifies the OTP. For clients that exist only in the `clients`
 * table (pre-created by an employee), auto-provisions the auth user, links
 * the client record, and assigns the client role. Returns a Supabase session
 * for `supabase.auth.setSession()` on the client.
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data }) => {
    const { consumeOtp } = await import("@/lib/otp/otp-store.server");
    const approved = await consumeOtp(data.phone, data.code);
    if (!approved) throw new Error("Invalid or expired verification code.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let profile = await findProfileByPhone(data.phone);
    let userId: string | null = profile?.id ?? null;

    // Auto-provision client accounts from a pre-created client row.
    if (!userId && data.role === "client") {
      const clientRow = await findClientRowByPhone(data.phone);
      if (!clientRow) throw new Error("This phone number is not registered as a client.");

      const email = syntheticEmail(data.phone);
      const password = randomPassword();
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          phone: data.phone,
          phone_confirm: true,
          user_metadata: {
            name: clientRow.contact_person ?? clientRow.business_name ?? "",
            phone: data.phone,
          },
        });
      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? "Failed to create client account");
      }
      userId = created.user.id;

      // handle_new_user trigger created profile + default 'client' role.
      // Backfill phone (belt & suspenders) and link the pre-created client row.
      await supabaseAdmin
        .from("profiles")
        .update({ phone: data.phone })
        .eq("id", userId);
      await supabaseAdmin
        .from("clients")
        .update({ user_id: userId })
        .eq("id", clientRow.id);
    }

    if (!userId) throw new Error("No account found for this phone number.");

    // Enforce role match at verify time too.
    const roles = await getRoles(userId);
    if (!roles.has(data.role)) {
      throw new Error(`This phone number is not registered as ${data.role}.`);
    }

    // Rotate to a one-shot password, sign in to mint a session.
    const password = randomPassword();
    const { data: updated, error: updErr } =
      await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (updErr) throw new Error(updErr.message);
    const email = updated.user?.email;
    if (!email) throw new Error("Account is missing an email; contact support.");

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInErr } =
      await authClient.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn.session) {
      throw new Error(signInErr?.message ?? "Failed to sign in");
    }

    return {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    };
  });
