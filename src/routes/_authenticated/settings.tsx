import { PhoneDisplay } from "@/components/phone-display";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { toast } from "sonner";

import { getMe } from "@/lib/me.functions";
import { getUserSettings, upsertUserSettings } from "@/lib/user-settings.functions";
import { createAdminUser, listAdmins } from "@/lib/admin-users.functions";
import { useTheme } from "@/components/theme-provider";
import { LANG_STORAGE_KEY } from "@/i18n";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LBGS" },
      { name: "description", content: "Manage appearance, language, and admin accounts." },
      { property: "og:title", content: "Settings — LBGS" },
      { property: "og:description", content: "Manage appearance, language, and admin accounts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation();
  const { data: me } = useSuspenseQuery({ queryKey: qk.me, queryFn: () => getMe() });
  const isAdmin = me.role === "admin";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>
      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance">{t("settings.tabs.appearance")}</TabsTrigger>
          {isAdmin && <TabsTrigger value="admins">{t("settings.tabs.admins")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="admins" className="mt-4">
            <AdminsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AppearanceTab() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const save = useServerFn(upsertUserSettings);
  const getSettings = useServerFn(getUserSettings);
  const { data: remote } = useQuery({ queryKey: qk.userSettings, queryFn: () => getSettings() });

  // Hydrate from remote once on load (fall back to local values already applied)
  useEffect(() => {
    if (!remote) return;
    if (remote.language && remote.language !== i18n.language) {
      i18n.changeLanguage(remote.language);
      try { localStorage.setItem(LANG_STORAGE_KEY, remote.language); } catch {}
    }
    if (remote.theme && remote.theme !== theme) {
      setTheme(remote.theme as "light" | "dark" | "system");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  async function onThemeChange(v: string) {
    const next = v as "light" | "dark" | "system";
    setTheme(next);
    try { await save({ data: { theme: next } }); toast.success(t("settings.appearance.saved")); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  async function onLangChange(v: string) {
    i18n.changeLanguage(v);
    try { localStorage.setItem(LANG_STORAGE_KEY, v); } catch {}
    try { await save({ data: { language: v } }); toast.success(t("settings.appearance.saved")); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance.theme")}</CardTitle>
          <CardDescription>{t("settings.appearance.themeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={theme} onValueChange={onThemeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("settings.appearance.light")}</SelectItem>
              <SelectItem value="dark">{t("settings.appearance.dark")}</SelectItem>
              <SelectItem value="system">{t("settings.appearance.system")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance.language")}</CardTitle>
          <CardDescription>{t("settings.appearance.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={i18n.language.slice(0, 2)} onValueChange={onLangChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="hi">हिन्दी (Hindi)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}

const adminFormSchema = z.object({
  name: z.string().trim().min(2, "Name too short").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format, e.g. +919876543210"),
});

function AdminsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(listAdmins);
  const create = useServerFn(createAdminUser);
  const { data: admins, isLoading } = useQuery({ queryKey: qk.admins, queryFn: () => list() });

  const [form, setForm] = useState({ name: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = adminFormSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrs: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrs[issue.path[0] as string] = issue.message;
      setErrors(fieldErrs);
      return;
    }
    setSubmitting(true);
    try {
      await create({
        data: {
          name: form.name,
          phone: form.phone,
        },
      });
      toast.success(t("settings.admins.success"));
      setForm({ name: "", phone: "" });
      qc.invalidateQueries({ queryKey: qk.admins });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.admins.title")}</CardTitle>
          <CardDescription>{t("settings.admins.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-name">{t("settings.admins.name")}</Label>
              <Input id="a-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-phone">Phone number</Label>
              <Input id="a-phone" type="tel" placeholder="+919876543210" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="md:col-span-2">
              <p className="mb-2 text-xs text-muted-foreground">E.164 format, including country code. This phone is used for OTP sign-in.</p>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("settings.admins.creating") : t("settings.admins.create")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>




      <Card>
        <CardHeader>
          <CardTitle>{t("settings.admins.existing")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(admins ?? []).map((a) => (
                  <TableRow key={a.user_id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>{a.phone ? <PhoneDisplay phone={a.phone} canReveal /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{fmtDate(a.created_at)}</TableCell>
                  </TableRow>
                ))}
                {(admins ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No admins yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

          )}
        </CardContent>
      </Card>
    </div>
  );
}
