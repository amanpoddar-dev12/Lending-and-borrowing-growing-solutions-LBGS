import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const phoneRegex = /^\+[1-9]\d{7,14}$/;

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, "Phone must be in E.164 format, e.g. +919876543210"),
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

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role, created_at")
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, email, name, phone")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);
    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const disabled = new Map<string, boolean>();
    await Promise.all(
      ids.map(async (id: string) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        const until = (u?.user as any)?.banned_until;
        disabled.set(id, !!until && new Date(until).getTime() > Date.now());
      }),
    );
    return (roles ?? []).map((r: any) => ({
      user_id: r.user_id,
      email: (pMap.get(r.user_id) as any)?.email ?? "",
      name: (pMap.get(r.user_id) as any)?.name ?? "",
      phone: (pMap.get(r.user_id) as any)?.phone ?? "",
      created_at: r.created_at as string,
      disabled: disabled.get(r.user_id) ?? false,
      is_self: r.user_id === context.userId,
    }));
  });

/** Disable (block sign-in) or re-enable another admin account. */
export const setAdminDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), disabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't disable your own account.");
    const { data: isTargetAdmin } = await context.supabase.rpc("has_role", {
      _user_id: data.userId,
      _role: "admin",
    });
    if (!isTargetAdmin) throw new Error("That user is not an admin.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId,
      action: data.disabled ? "admin.disabled" : "admin.enabled",
      module: "admins",
      target_type: "user",
      target_id: data.userId,
      status: "success",
    } as any);
    return { ok: true };
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject phone numbers already in use.
    const { data: existingPhone } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();
    if (existingPhone) throw new Error("Phone number is already in use.");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail(data.phone),
      password: randomPassword(),
      email_confirm: true,
      phone: data.phone,
      phone_confirm: true,
      user_metadata: { name: data.name, phone: data.phone },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create admin user");
    }
    const newId = created.user.id;

    // handle_new_user trigger inserted profile + default 'client' role.
    // Swap client role for admin.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId).eq("role", "client");
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: "admin" });
    if (roleErr) throw new Error(roleErr.message);

    // Belt-and-suspenders: ensure phone is on profile.
    await supabaseAdmin.from("profiles").update({ phone: data.phone }).eq("id", newId);

    return { ok: true, userId: newId };
  });
