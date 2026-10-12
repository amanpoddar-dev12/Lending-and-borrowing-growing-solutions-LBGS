import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const upsertSchema = z.object({
  language: z.string().min(2).max(10).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export const updateMyName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    name: z.string().trim().min(2, "Enter at least 2 characters").max(100, "Use 100 characters or fewer"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .update({ name: data.name })
      .eq("id", context.userId)
      .select("name")
      .single();
    if (error) throw new Error(error.message);
    return profile;
  });

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_settings")
      .select("language, theme")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { language: "en", theme: "system" };
  });

export const upsertUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      ...(data.language ? { language: data.language } : {}),
      ...(data.theme ? { theme: data.theme } : {}),
    };
    const { error } = await context.supabase
      .from("user_settings")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
