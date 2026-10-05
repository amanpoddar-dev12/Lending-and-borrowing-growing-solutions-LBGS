import { createFileRoute, Navigate, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/lib/me.functions";
import { getProfileCompletion } from "@/lib/profile-completion.functions";
import { getUserSettings } from "@/lib/user-settings.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/theme-provider";
import { LANG_STORAGE_KEY } from "@/i18n";
import { useAutoDuty } from "@/hooks/use-auto-duty";
import { LocationPermissionBanner } from "@/components/location-permission-banner";
import { LogOut } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { teardownAllRealtime } from "@/lib/realtime-hub";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  loader: async ({ context }) => {
    // The session can disappear between beforeLoad and here (e.g. sign-out
    // re-runs the route). Without a token getMe() 401s and blanks the app.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return context.queryClient.ensureQueryData({ queryKey: qk.me, queryFn: () => getMe() });
  },
  component: AuthedLayout,
  errorComponent: ({ error }) =>
    /unauthorized/i.test((error as Error)?.message ?? "") ? (
      <Navigate to="/auth" replace />
    ) : (
      <div className="grid min-h-screen place-items-center p-4">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">{(error as Error)?.message}</p>
        </div>
      </div>
    ),
});

function AuthedLayout() {
  const { data: me } = useSuspenseQuery({ queryKey: qk.me, queryFn: () => getMe() });
  const getCompletion = useServerFn(getProfileCompletion);
  const { data: completion } = useQuery({
    queryKey: qk.profileCompletion,
    queryFn: () => getCompletion(),
  });
  const router = useRouter();
  const qc = useQueryClient();
  const { i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const getSettings = useServerFn(getUserSettings);
  const { data: settings } = useQuery({ queryKey: qk.userSettings, queryFn: () => getSettings() });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useAutoDuty(me?.role);

  // Force incomplete profiles to the setup screen before anything else.
  useEffect(() => {
    if (!completion) return;
    if (!completion.complete && pathname !== "/complete-profile") {
      router.navigate({ to: "/complete-profile", replace: true });
    }
  }, [completion, pathname, router]);

  // Role-based route guard: employees/clients cannot access other roles' sections.
  useEffect(() => {
    if (!me) return;
    if (pathname === "/complete-profile") return;
    const isAllowed =
      me.role === "admin" ||
      (me.role === "employee" && !pathname.startsWith("/admin/") && !pathname.startsWith("/client/")) ||
      (me.role === "client" && !pathname.startsWith("/admin/") && !pathname.startsWith("/employee/"));
    if (!isAllowed) {
      router.navigate({ to: "/dashboard", replace: true });
    }
  }, [me, pathname, router]);


  useEffect(() => {
    if (!settings) return;
    if (settings.language && settings.language !== i18n.language) {
      i18n.changeLanguage(settings.language);
      try { localStorage.setItem(LANG_STORAGE_KEY, settings.language); } catch {}
    }
    if (settings.theme && settings.theme !== theme) {
      setTheme(settings.theme as "light" | "dark" | "system");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);


  async function signOut() {
    teardownAllRealtime();
    await qc.cancelQueries();
    router.navigate({ to: "/auth", replace: true });
    qc.removeQueries();
    await supabase.auth.signOut();
  }

  return (
    <SidebarProvider>
      <AppSidebar role={me.role} name={me.profile?.name ?? me.profile?.email ?? "User"} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <div className="ml-2 text-sm font-medium capitalize text-muted-foreground">
            {me.role} · <span className="text-foreground">{me.profile?.name ?? me.profile?.email}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-1 size-4" /> Sign out
            </Button>
          </div>
        </header>
        <div className="p-4 md:p-6">
          <LocationPermissionBanner role={me.role} />
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
