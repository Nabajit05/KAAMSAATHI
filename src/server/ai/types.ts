import "server-only";
import type { Locale } from "@/domain/case";
import type { Extraction } from "@/shared/contracts";

/** Small adapter interfaces so providers can be faked in tests or swapped. */

export interface ImageInput {
  documentId: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
}

export interface Extractor {
  extract(images: ImageInput[], signal: AbortSignal): Promise<unknown>;
}

export interface Drafter {
  draft(input: { system: string; prompt: string; locale: Locale }, signal: AbortSignal): Promise<string>;
}

export interface Transcriber {
  transcribe(audio: Blob, signal: AbortSignal): Promise<{ transcript: string; languageCode: string | null }>;
}

export interface Synthesizer {
  synthesize(text: string, locale: Locale, signal: AbortSignal): Promise<Buffer>;
}

export class ProviderError extends Error {
  constructor(
    public kind: "unavailable" | "timeout" | "rate_limited" | "invalid_output" | "not_configured",
    message: string = kind,
  ) {
    super(message);
  }
}

export type { Extraction };
