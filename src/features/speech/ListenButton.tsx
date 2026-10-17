"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/app/providers";
import { Button } from "@/components/ui";
import type { Locale } from "@/domain/case";
import { ApiError } from "@/shared/errors";

/** On-demand speech of approved text. Never autoplays; the text stays on screen. */
export function ListenButton({ text, locale }: { text: string; locale: Locale }) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "loading" | "playing" | "unavailable" | "error">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  const play = async () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/speech/synthesize", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 1500), locale }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(body?.error?.code ?? "internal", "tts", res.status);
      }
      const blob = await res.blob();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      audio.current = new Audio(url.current);
      audio.current.onended = () => setState("idle");
      await audio.current.play();
      setState("playing");
    } catch (e) {
      setState(e instanceof ApiError && (e.code === "not_configured" || e.code === "ai_unavailable") ? "unavailable" : "error");
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" icon={state === "playing" ? "stop" : "volume"} busy={state === "loading"} onClick={play}>
        {state === "playing" ? t("complaint.stop") : t("complaint.listen")}
      </Button>
      {state === "unavailable" ? <p className="text-sm text-muted">{t("complaint.listenUnavailable")}</p> : null}
      {state === "error" ? <p className="text-sm text-error">{t("error.generic")}</p> : null}
    </div>
  );
}
