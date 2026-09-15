import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmployeeLocationHistory } from "@/lib/duty.functions";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";
import { formatAddress } from "@/lib/reverse-geocode";
import { ArrowLeft, MapPin } from "lucide-react";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/locations/$employeeId")({
  head: () => ({
    meta: [
      { title: "Location history — LBGS" },
      { name: "description", content: "Recent location history for a field employee." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: History,
});

function History() {
  const { employeeId } = Route.useParams();
  const fn = useServerFn(listEmployeeLocationHistory);
  const { data = [] } = useQuery({
    queryKey: qk.locationHistory(employeeId),
    queryFn: () => fn({ data: { employee_id: employeeId, limit: 200 } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin/locations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All employees
        </Link>
      </div>
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">Location history</h1>
        <p className="text-sm text-muted-foreground">Most recent 200 pings, newest first.</p>
      </div>
      <div className="space-y-2">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No pings recorded.</p>}
        {data.map((l: any) => (
          <Card key={l.id}>
            <CardContent className="flex items-start gap-3 p-3">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{formatAddress(l) || "Unknown location"}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtDateTime(l.captured_at)}
                  {l.accuracy_meters && <> · ±{l.accuracy_meters}m</>}
                  {l.source && <> · {l.source.toUpperCase()}</>}
                </div>
              </div>
              <a
                href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`}
                target="_blank" rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Map
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
