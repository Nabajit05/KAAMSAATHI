import "server-only";
import { integrations } from "../config";
import { geminiDrafter, geminiExtractor, geminiSynthesizer, geminiTranscriber } from "./gemini";
import type { Drafter, Extractor, Synthesizer, Transcriber } from "./types";

/** Returns configured providers, or null so callers can show an honest fallback. */
export const providers = {
  extractor: (): Extractor | null => (integrations.gemini() ? geminiExtractor : null),
  drafter: (): Drafter | null => (integrations.gemini() ? geminiDrafter : null),
  transcriber: (): Transcriber | null => (integrations.speech() ? geminiTranscriber : null),
  synthesizer: (): Synthesizer | null => (integrations.speech() ? geminiSynthesizer : null),
};
