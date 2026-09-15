import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmployeeLatestLocations } from "@/lib/duty.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { formatAddress } from "@/lib/reverse-geocode";
import { MapPin, History } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/locations")({
  head: () => ({
    meta: [
      { title: "Locations — LBGS" },
      { name: "description", content: "Latest known location for each field employee." },
      { property: "og:title", content: "Locations — LBGS" },
      { property: "og:description", content: "Latest known location for each field employee." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Locations,
});

function Locations() {
  const fn = useServerFn(listEmployeeLatestLocations);
  const { data = [] } = useQuery({
    queryKey: qk.locations,
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">Employee locations</h1>
        <p className="text-sm text-muted-foreground">Latest reported location per employee. Updates automatically every 5 minutes.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No location updates yet.</p>}
        {data.map((l: any) => {
          const address = formatAddress(l);
          const stale = Date.now() - new Date(l.captured_at).getTime() > 15 * 60 * 1000;
          return (
            <Card key={l.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    <MapPin className="size-4" />{l.profiles?.name ?? "—"}
                  </div>
                  {stale
                    ? <Badge variant="secondary">Stale</Badge>
                    : <Badge className="bg-emerald-600">Live</Badge>}
                </div>
                <div className="text-sm">{address || "Unknown location"}</div>
                <div className="text-xs text-muted-foreground">
                  Updated {fmtDateTime(l.captured_at)}
                  {l.accuracy_meters && <> · ±{l.accuracy_meters}m</>}
                  {l.source && <> · {l.source.toUpperCase()}</>}
                </div>
                <div className="flex items-center gap-3 pt-1 text-xs">
                  <a
                    href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`}
                    target="_blank" rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Open in Maps
                  </a>
                  <Link
                    to="/admin/locations/$employeeId"
                    params={{ employeeId: l.employee_id }}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <History className="size-3.5" /> History
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
