import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Uploads a recording to the private bucket and returns its storage path. */
export async function uploadVoiceNote(visitId: string, blob: Blob) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You are signed out. Sign in again to upload the recording.");
  const path = `${uid}/${visitId}-${Date.now()}.webm`;
  const { error } = await supabase.storage
    .from("field-visit-audio")
    .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Optional voice message for a field visit. Fully self-contained: mic
 * permission handling, record / stop / preview / delete. The parent receives
 * the recorded blob (or null) and uploads it when the task is submitted.
 */
export function VoiceNoteRecorder({
  value,
  onChange,
  disabled,
}: {
  value: Blob | null;
  onChange: (b: Blob | null) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!value) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Audio recording is not supported on this device or browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        // Guard against accidental empty / near-silent taps.
        if (blob.size < 1200) {
          setError("That recording was too short. Hold on for a moment and try again.");
          onChange(null);
        } else {
          onChange(blob);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings to record a voice message."
          : e?.message ?? "Could not start recording.",
      );
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    recorderRef.current?.stop();
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Voice message</span>
        <span className="text-xs text-muted-foreground">Optional</span>
        {recording && (
          <span className="ml-auto flex items-center gap-1 text-xs text-destructive">
            <span className="size-2 animate-pulse rounded-full bg-destructive" /> {mmss}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!recording && !value && (
          <Button type="button" size="sm" variant="outline" onClick={start} disabled={disabled}>
            <Mic className="mr-1 size-4" /> Record
          </Button>
        )}
        {recording && (
          <Button type="button" size="sm" variant="destructive" onClick={stop}>
            <Square className="mr-1 size-4" /> Stop
          </Button>
        )}
        {value && !recording && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(null); setSeconds(0); }} disabled={disabled}>
              <Trash2 className="mr-1 size-4" /> Delete
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { onChange(null); setSeconds(0); start(); }} disabled={disabled}>
              <Mic className="mr-1 size-4" /> Re-record
            </Button>
          </>
        )}
      </div>

      {previewUrl && !recording && (
        <audio controls src={previewUrl} className="w-full" preload="metadata" />
      )}

      {error && (
        <p className="flex items-start gap-1 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
