import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFieldVisitVoiceUrl } from "@/lib/field-visits.functions";
import { Loader2, Mic } from "lucide-react";

/** Plays a field-visit recording through a short-lived signed URL. */
export function VoiceNotePlayer({ path, label = "Voice message" }: { path: string; label?: string }) {
  const urlFn = useServerFn(getFieldVisitVoiceUrl);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["field-visit-voice", path],
    queryFn: () => urlFn({ data: { path } }),
    staleTime: 20 * 60_000,
  });

  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-2">
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Mic className="size-3" /> {label}
      </div>
      {isLoading ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Loading audio…
        </p>
      ) : isError || !data?.url ? (
        <p className="text-xs text-destructive">{(error as any)?.message ?? "Could not load this recording."}</p>
      ) : (
        <audio controls src={data.url} preload="none" className="w-full" />
      )}
    </div>
  );
}
