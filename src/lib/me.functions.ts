import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_PERMISSIONS } from "./permissions";

// Session/profile/role info for the current user. Called from the root subscriber
// and from the role router.
// POST (not GET) so the browser/CDN never caches the response — a cached GET
// would serve the previous profile (e.g. old name) after re-login.
export const getMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    const role = roleSet.has("admin") ? "admin" : roleSet.has("employee") ? "employee" : "client";
    let clientRecord: { id: string; business_name: string } | null = null;
    if (role === "client") {
      const { data } = await supabase.from("clients").select("id, business_name").eq("user_id", userId).maybeSingle();
      clientRecord = data as typeof clientRecord;
    }
    let permissions: string[] = [];
    if (role === "admin") {
      permissions = [...ALL_PERMISSIONS];
    } else if (role === "employee") {
      const { data: perms } = await supabase
        .from("employee_permissions")
        .select("permission")
        .eq("employee_id", userId);
      permissions = (perms ?? []).map((p) => p.permission);
    }
    return { userId, profile, role, clientRecord, permissions };
  });
