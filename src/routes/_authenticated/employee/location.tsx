import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAutoLocation } from "@/hooks/use-auto-location";
import { fmtDateTime } from "@/lib/format";
import { MapPinned, ShieldCheck, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/employee/location")({
  head: () => ({
    meta: [
      { title: "My location — LBGS" },
      { name: "description", content: "Your live location shared with admins for attendance and field tracking." },
      { property: "og:title", content: "My location — LBGS" },
      { property: "og:description", content: "Your live location shared with admins for attendance and field tracking." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LocationPage,
});

function LocationPage() {
  const loc = useAutoLocation("employee");

  const status =
    loc.permission === "granted" ? { label: "Tracking active", tone: "ok" as const }
    : loc.permission === "denied" ? { label: "Permission blocked", tone: "warn" as const }
    : loc.permission === "unsupported" ? { label: "Not supported", tone: "warn" as const }
    : { label: "Awaiting permission", tone: "warn" as const };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">My location</h1>
        <p className="text-sm text-muted-foreground">
          Location updates automatically every 5 minutes while you're signed in. Used for attendance verification and field activity.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="size-5" /> Current location
          </CardTitle>
          {status.tone === "ok"
            ? <Badge className="bg-emerald-600"><ShieldCheck className="mr-1 size-3.5" />{status.label}</Badge>
            : <Badge variant="secondary"><AlertTriangle className="mr-1 size-3.5" />{status.label}</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          {loc.lastAddress ? (
            <div className="rounded-md border border-border p-3 text-sm">
              <div className="font-medium">{loc.lastAddress}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {loc.lastAt && <>Updated {fmtDateTime(loc.lastAt)}</>}
                {loc.lastAccuracy && <> · Accuracy ±{loc.lastAccuracy}m</>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {loc.permission === "granted"
                ? "Waiting for the first GPS fix…"
                : "Grant location permission to start sharing your position."}
            </p>
          )}
          {loc.lastError && (
            <div className="text-xs text-amber-600">{loc.lastError}</div>
          )}
          {loc.permission !== "granted" && loc.permission !== "unsupported" && (
            <Button onClick={loc.request}>Enable location</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
