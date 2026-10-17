"use client";

import { api } from "@/features/cases/client";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export const MAX_FILES = 5;
export const MAX_BYTES = 8 * 1024 * 1024;
export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;

export type LocalCheck = { ok: true } | { ok: false; reason: "badType" | "tooBig" };

/** Client-side checks are for usability only; the server re-checks bytes, type and size. */
export function checkLocalFile(f: File): LocalCheck {
  if (!(ACCEPTED as readonly string[]).includes(f.type)) return { ok: false, reason: "badType" };
  if (f.size > MAX_BYTES) return { ok: false, reason: "tooBig" };
  return { ok: true };
}

/**
 * Direct-to-storage upload: the server issues a one-time signed upload URL for
 * a random path under the owner's folder, the browser uploads, and the server
 * then verifies the stored bytes before marking the record usable.
 */
export async function uploadEvidence(caseId: string, file: File, workerRedacted: boolean): Promise<void> {
  const init = await api<{ evidenceId: string; path: string; token: string }>(`/api/cases/${caseId}/evidence`, {
    method: "POST",
    json: { filename: file.name.slice(0, 120), mime: file.type, byteSize: file.size, workerRedacted },
  });
  const sb = supabaseBrowser();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.storage.from("evidence").uploadToSignedUrl(init.path, init.token, file, { contentType: file.type });
  if (error) throw new Error("upload_failed");
  await api(`/api/cases/${caseId}/evidence/${init.evidenceId}`, { method: "POST", json: {} });
}
