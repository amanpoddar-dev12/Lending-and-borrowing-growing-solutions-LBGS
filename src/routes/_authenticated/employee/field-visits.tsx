import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFieldVisits, setFieldVisitStatus, setFieldVisitVoiceNote } from "@/lib/field-visits.functions";
import { qk } from "@/lib/query-keys";
import { invalidateFor } from "@/lib/query-mutations";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { VisitPriorityBadge, VisitStatusBadge, visitTarget, visitWhen } from "@/components/field-visits/field-visit-bits";
import { VoiceNoteRecorder, uploadVoiceNote } from "@/components/field-visits/voice-note-recorder";
import { VoiceNotePlayer } from "@/components/field-visits/voice-note-player";

export const Route = createFileRoute("/_authenticated/employee/field-visits")({
  head: () => ({
    meta: [
      { title: "My field visits — Kredix" },
      { name: "description", content: "Field visits assigned to you, with reminders and outcomes." },
      { property: "og:title", content: "My field visits — Kredix" },
      { property: "og:description", content: "Field visits assigned to you, with reminders and outcomes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyFieldVisits,
});

function MyFieldVisits() {
  const listFn = useServerFn(listFieldVisits);
  const statusFn = useServerFn(setFieldVisitStatus);
  const voiceFn = useServerFn(setFieldVisitVoiceNote);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: qk.fieldVisits, queryFn: () => listFn() });

  const [closing, setClosing] = useState<{ visit: any; status: "completed" | "cancelled" } | null>(null);
  const [note, setNote] = useState("");
  const [voice, setVoice] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);

  const act = useMutation({
    mutationFn: async (v: { id: string; status: "completed" | "cancelled"; note?: string }) => {
      // The recording is optional — upload it first so a failed upload never
      // silently closes the visit without its voice message.
      if (voice) {
        setUploading(true);
        try {
          const path = await uploadVoiceNote(v.id, voice);
          await voiceFn({ data: { id: v.id, path } });
        } finally {
          setUploading(false);
        }
      }
      return statusFn({ data: v });
    },
    onSuccess: () => {
      toast.success("Visit updated");
      setClosing(null);
      setNote("");
      setVoice(null);
      invalidateFor(qc, "fieldVisit");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the visit"),
  });

  const { open, done } = useMemo(() => {
    const rows = data as any[];
    return {
      open: rows.filter((v) => ["pending", "assigned", "overdue"].includes(v.status)),
      done: rows.filter((v) => ["completed", "cancelled"].includes(v.status)),
    };
  }, [data]);

  const card = (v: any, closed: boolean) => (
    <Card key={v.id}>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-medium">{visitTarget(v)}</div>
            <div className="text-xs text-muted-foreground">{visitWhen(v)}</div>
          </div>
          <div className="flex gap-1"><VisitPriorityBadge priority={v.priority} /><VisitStatusBadge status={v.status} /></div>
        </div>
        <div className="text-sm">{v.purpose}</div>
        {v.location && <div className="text-xs text-muted-foreground">📍 {v.location}</div>}
        {v.instructions && <div className="rounded-md bg-muted/50 p-2 text-xs">{v.instructions}</div>}
        {v.completion_notes && <div className="text-xs text-muted-foreground">Outcome: {v.completion_notes}</div>}
        {v.cancelled_reason && <div className="text-xs text-muted-foreground">Cancelled: {v.cancelled_reason}</div>}
        {v.voice_note_path && <VoiceNotePlayer path={v.voice_note_path} label="Your voice message" />}
        {!closed && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => { setClosing({ visit: v, status: "completed" }); setNote(""); setVoice(null); }}>Mark completed</Button>
            <Button size="sm" variant="ghost" className="text-destructive"
              onClick={() => { setClosing({ visit: v, status: "cancelled" }); setNote(""); setVoice(null); }}>Cannot visit</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">My field visits</h1>
        <p className="text-sm text-muted-foreground">Visit reminders assigned to you by admin.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Upcoming</div>
            {open.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits assigned right now.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">{open.map((v) => card(v, false))}</div>
            )}
          </section>
          <section className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">History</div>
            {done.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing closed yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">{done.map((v) => card(v, true))}</div>
            )}
          </section>
        </>
      )}

      <Dialog open={!!closing} onOpenChange={(o) => { if (!o && !uploading) { setClosing(null); setVoice(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{closing?.status === "completed" ? "Complete visit" : "Cannot complete visit"}</DialogTitle>
            <DialogDescription>{closing ? `${visitTarget(closing.visit)} · ${visitWhen(closing.visit)}` : ""}</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={closing?.status === "completed" ? "What happened during the visit? (optional)" : "Reason (required)"} />
          <VoiceNoteRecorder value={voice} onChange={setVoice} disabled={act.isPending} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Back</Button>
            <Button
              variant={closing?.status === "cancelled" ? "destructive" : "default"}
              disabled={act.isPending || (closing?.status === "cancelled" && !note.trim())}
              onClick={() => closing && act.mutate({ id: closing.visit.id, status: closing.status, note: note || undefined })}
            >
              {uploading ? "Uploading audio…" : act.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
