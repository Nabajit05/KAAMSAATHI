"use client";

import { useEffect, useRef, useState } from "react";
import { useAnnounce, useT } from "@/app/providers";
import { Button } from "@/components/ui";
import { ApiError } from "@/shared/errors";

const MAX_SECONDS = 30;

type State = "idle" | "recording" | "transcribing" | "error";

/**
 * Start / stop / cancel recording with a visible duration — no press-and-hold.
 * Audio stays in memory, is sent once for transcription and then dropped.
 */
export function VoiceRecorder({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { t } = useT();
  const announce = useAnnounce();
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  const transcribe = async (blob: Blob) => {
    setState("transcribing");
    announce(t("voice.transcribing"));
    const form = new FormData();
    form.append("audio", blob, "speech.webm");
    form.append("idempotencyKey", crypto.randomUUID());
    try {
      const res = await fetch("/api/speech/transcribe", { method: "POST", body: form, credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(body?.error?.code ?? "internal", "stt", res.status);
      }
      const { transcript } = (await res.json()) as { transcript: string };
      onTranscript(transcript);
      setState("idle");
      setMessage(t("voice.done"));
      announce(t("voice.done"));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "internal";
      const msg = code === "not_configured" ? t("voice.unavailable") : code === "unauthorized" ? t("voice.signInFirst") : t("voice.failed");
      setState("error");
      setMessage(msg);
      announce(msg);
    }
  };

  const start = async () => {
    setMessage(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setMessage(t("voice.unsupported"));
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("error");
      setMessage(t("voice.denied"));
      return;
    }
    const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      cleanup();
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      chunks.current = [];
      if (cancelled.current || blob.size === 0) {
        setState("idle");
        return;
      }
      void transcribe(blob);
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) {
          setMessage(t("voice.tooLong"));
          if (recorder.current?.state === "recording") recorder.current.stop();
        }
        return s + 1;
      });
    }, 1000);
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  const cancel = () => {
    cancelled.current = true;
    stop();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {state === "recording" ? (
          <>
            <Button variant="dark" icon="stop" onClick={stop}>
              {t("voice.stop")}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {t("voice.cancel")}
            </Button>
            <span className="tabular text-sm font-medium" aria-live="off">
              <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-error" />
              {t("voice.recording", { seconds })}
            </span>
          </>
        ) : (
          <Button variant="secondary" icon="mic" busy={state === "transcribing"} onClick={start}>
            {state === "transcribing" ? t("voice.transcribing") : t("voice.record")}
          </Button>
        )}
      </div>
      {message ? <p className={`text-sm ${state === "error" ? "text-attention-ink" : "text-muted"}`}>{message}</p> : null}
    </div>
  );
}
