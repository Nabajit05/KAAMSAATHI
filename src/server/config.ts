import "server-only";

/**
 * Server-only configuration. Values are read lazily so a missing optional
 * integration disables that feature with a clear state instead of crashing.
 * Never log these values.
 */
export const serverConfig = {
  geminiApiKey: () => process.env.GEMINI_API_KEY ?? "",
  /** Verified against https://ai.google.dev/gemini-api/docs/models on 2026-10-17. */
  geminiModel: () => process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  /** Listed by the models endpoint for this key on 2026-10-17. Also used for speech-to-text. */
  geminiTtsModel: () => process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts",
  geminiTtsVoice: () => process.env.GEMINI_TTS_VOICE ?? "Kore",
  supabaseServiceRoleKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  /** Per-user daily caps on billed AI operations. */
  dailyExtractLimit: () => Number(process.env.DAILY_EXTRACT_LIMIT ?? 20),
  dailyDraftLimit: () => Number(process.env.DAILY_DRAFT_LIMIT ?? 20),
  dailySpeechLimit: () => Number(process.env.DAILY_SPEECH_LIMIT ?? 30),
  /** Whole-deployment cap on demo AI calls per instance per day (unauthenticated, fictional data only). */
  demoDailyLimit: () => Number(process.env.DEMO_DAILY_LIMIT ?? 200),
  aiTimeoutMs: () => Number(process.env.AI_TIMEOUT_MS ?? 25_000),
};

export const integrations = {
  gemini: () => Boolean(serverConfig.geminiApiKey()),
  speech: () => Boolean(serverConfig.geminiApiKey()),
};
