import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendOtp, verifyOtp } from "@/lib/phone-auth.functions";
import { demoSignIn } from "@/lib/demo-auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Briefcase, User, ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/global-loader";
import { IN_PHONE_REGEX, IN_PHONE_MESSAGE, normalizeIndianPhone } from "@/lib/phone";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — LBGS" },
      { name: "description", content: "Sign in to your LBGS workspace with your mobile number." },
      { property: "og:title", content: "Sign in — LBGS" },
      { property: "og:description", content: "Sign in to your LBGS workspace with your mobile number." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Role = "admin" | "employee" | "client";
type Step = "phone" | "code";

const ROLE_META: Record<Role, { icon: typeof Shield; titleKey: string; descKey: string }> = {
  admin: { icon: Shield, titleKey: "auth.roles.admin", descKey: "auth.roleDesc.admin" },
  employee: { icon: Briefcase, titleKey: "auth.roles.employee", descKey: "auth.roleDesc.employee" },
  client: { icon: User, titleKey: "auth.roles.client", descKey: "auth.roleDesc.client" },
};

const RESEND_SECONDS = 120;

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const send = useServerFn(sendOtp);
  const verify = useServerFn(verifyOtp);
  const demo = useServerFn(demoSignIn);

  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function changeRole() {
    setRole(null);
    setStep("phone");
    setPhone("");
    setCode("");
    setCooldown(0);
  }

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    const normalized = normalizeIndianPhone(phone);
    if (!IN_PHONE_REGEX.test(normalized)) {
      return toast.error(IN_PHONE_MESSAGE);
    }
    setPhone(normalized);
    setBusy(true);
    try {
      await send({ data: { phone: normalized, role } });
      toast.success("Verification code sent");
      setStep("code");
      setCooldown(RESEND_SECONDS);
    } catch (err: any) {
      console.log(err);
      toast.error(err?.message ?? "Failed to send code");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (!role || cooldown > 0 || busy) return;
    setBusy(true);
    try {
      await send({ data: { phone, role } });
      toast.success("Code resent");
      setCooldown(RESEND_SECONDS);
    } catch (err: any) {
      console.log(err);
      toast.error(err?.message ?? "Failed to resend");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    if (code.trim().length < 4) return toast.error("Enter the code you received");
    setBusy(true);
    try {
      const res = await verify({ data: { phone, code: code.trim(), role } });
      const { error } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (error) throw error;
      toast.success(t("auth.signedIn"));
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  }
  async function onDemo(r: Role) {
    setBusy(true);
    try {
      const res = await demo({ data: { role: r } });
      const { error } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (error) throw error;
      toast.success(`Signed in as demo ${r}`);
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Demo sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid size-10 place-items-center rounded-md bg-primary text-primary-foreground font-bold">
            K
          </div>
          <CardTitle className="font-display text-2xl">{t("auth.welcome")}</CardTitle>
          <CardDescription>
            {role ? t(ROLE_META[role].descKey, { defaultValue: t("auth.subtitle") }) : t("auth.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!role ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                {t("auth.chooseRole", { defaultValue: "Continue as" })}
              </p>
              {(Object.keys(ROLE_META) as Role[]).map((r) => {
                const Icon = ROLE_META[r].icon;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="group flex w-full items-center gap-4 rounded-lg border border-border p-4 text-left transition hover:border-primary hover:bg-primary/5"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium capitalize">{t(ROLE_META[r].titleKey, { defaultValue: r })}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {t(ROLE_META[r].descKey, {
                          defaultValue:
                            r === "admin"
                              ? "Manage the workspace"
                              : r === "employee"
                                ? "Field sales & orders"
                                : "Order & pay on credit",
                        })}
                      </div>
                    </div>
                  </button>
                );
              })}
              <div className="mt-4 rounded-lg border border-dashed border-border p-3">
                <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Dev demo — quick sign-in</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ROLE_META) as Role[]).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onDemo(r)}
                      className="capitalize"
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={changeRole}
                className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3" /> {t("auth.changeRole", { defaultValue: "Change role" })}
              </button>
              <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                {(() => {
                  const Icon = ROLE_META[role].icon;
                  return <Icon className="size-4 text-primary" />;
                })()}
                <span className="capitalize text-foreground">
                  {t(ROLE_META[role].titleKey, { defaultValue: role })}
                </span>
              </div>

              {step === "phone" ? (
                <form onSubmit={onSendCode} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Mobile number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      placeholder="98765 43210"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => setPhone((p) => normalizeIndianPhone(p))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Indian mobile numbers only — type 10 digits and we'll add +91 for you.
                    </p>
                  </div>
                  <Button className="w-full" type="submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Spinner className="mr-2" /> Sending…
                      </>
                    ) : (
                      "Send code"
                    )}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {role === "admin"
                      ? "Admin accounts are created by another admin."
                      : role === "employee"
                        ? "Employee accounts are created by an admin."
                        : "Client accounts are created by your account manager."}
                  </p>
                </form>
              ) : (
                <form onSubmit={onVerify} className="space-y-4">
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                    Code sent to <span className="font-medium text-foreground">{phone}</span>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Verification code</Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" type="submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Spinner className="mr-2" /> Verifying…
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setStep("phone");
                        setCode("");
                      }}
                    >
                      Change phone
                    </button>
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                      disabled={busy || cooldown > 0}
                      onClick={onResend}
                    >
                      {cooldown > 0
                        ? `Resend in ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, "0")}`
                        : "Resend code"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
