import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { BarChart3, Users, ClipboardList, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lending and Borrowing Growing Solutions — B2B Trade & Credit Platform" },
      { name: "description", content: "One platform for orders, payments, credit terms, and field-staff productivity." },
      { property: "og:title", content: "Lending and Borrowing Growing Solutions — B2B Trade & Credit Platform" },
      { property: "og:description", content: "One platform for orders, payments, credit terms, and field-staff productivity." },
    ],
  }),
  beforeLoad: async ({ location }) => {
    // Server-safe: skip during SSR
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session && location.pathname === "/") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: Landing,
});

function Landing() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground font-bold">LBGS</div>
            <span className="font-display text-lg font-semibold">LBGS</span>
          </div>
          <nav className="flex items-center gap-3">
            {authed ? (
              <Button asChild><Link to="/dashboard">Open dashboard</Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
                <Button asChild><Link to="/auth" search={{ mode: "signup" }}>Get started</Link></Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">B2B Trade &amp; Credit Management</span>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Every order, payment, and rupee outstanding — in one clear view.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Lending and Borrowing Growing Solutions unifies your admin desk, field employees, and B2B clients. Track credit limits, approve orders, calculate penalties, and see collections in real time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth">Sign in to your workspace</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth" search={{ mode: "signup" }}>Create account</Link></Button>
          </div>
          <div className="mt-6 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">Try the demo:</strong> visit{" "}
            <a className="underline" href="/api/public/seed" target="_blank" rel="noreferrer">/api/public/seed</a>{" "}
            once to load sample data, then sign in with{" "}
            <code className="rounded bg-muted px-1">admin@demo.com</code>,{" "}
            <code className="rounded bg-muted px-1">employee@demo.com</code>, or{" "}
            <code className="rounded bg-muted px-1">client@demo.com</code> (password{" "}
            <code className="rounded bg-muted px-1">Demo1234!</code>).
          </div>
        </section>

        <section className="border-t border-border/60 bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-4">
            {[
              { i: <Users className="size-5" />, t: "Customer 360", d: "KYC, credit limit, ledger, and running balance in one panel." },
              { i: <ClipboardList className="size-5" />, t: "Order → Payment", d: "Punch orders, chase approvals, collect payments." },
              { i: <Wallet className="size-5" />, t: "Credit purse", d: "Live utilization with automatic penalty accrual." },
              { i: <BarChart3 className="size-5" />, t: "Sales insights", d: "Trends, top clients, employee performance." },
            ].map((f) => (
              <div key={f.t} className="rounded-lg border border-border bg-card p-5">
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">{f.i}</div>
                <h3 className="mt-4 text-base font-semibold">{f.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Lending and Borrowing Growing Solutions.
        </div>
      </footer>
    </div>
  );
}
