import { z } from "zod";
import { FIELD_DEFS, FIELD_KEYS, type FieldKey } from "@/domain/facts";
import { MAX_ABS_PAISE } from "@/domain/money";

/** Request/response schemas shared by client and server. No secrets here. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const localeSchema = z.enum(["en", "hi"]);
export const fieldKeySchema = z.enum(FIELD_KEYS as [FieldKey, ...FieldKey[]]);

export const createCaseSchema = z.object({
  workType: z.enum(["platform", "daily_wage"]),
  issueType: z.enum(["missing_incentive", "deduction", "payout_mismatch", "not_sure", "wage_due"]),
  platformLabel: z.string().trim().max(60).nullable(),
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
  description: z.string().trim().max(1000),
  descriptionSource: z.enum(["typed", "voice"]).nullable(),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

const factValue = z.union([z.number().int().safe(), z.string().max(40), z.null()]);

export const factSchema = z.object({
  value: factValue,
  provenance: z.enum(["record", "worker_entered", "worker_stated"]).nullable(),
  reviewState: z.enum(["unreviewed", "confirmed", "edited", "unreadable", "conflict", "unknown_confirmed"]),
  sourceDocumentId: z.string().max(80).nullable(),
  sourceExcerpt: z.string().max(240).nullable(),
  rawText: z.string().max(240).nullable(),
  unknownReason: z.string().max(240).nullable(),
  alternative: z
    .object({
      value: factValue,
      provenance: z.enum(["record", "worker_entered", "worker_stated"]),
      sourceDocumentId: z.string().max(80).nullable(),
      sourceExcerpt: z.string().max(240).nullable(),
    })
    .nullable(),
});

/** Validates a value against the field's kind, so a "count" can't hold a string, etc. */
export function valueFitsField(key: FieldKey, value: unknown): boolean {
  if (value === null) return true;
  const kind = FIELD_DEFS[key].kind;
  switch (kind) {
    case "money":
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_ABS_PAISE;
    case "signed_money":
      return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= MAX_ABS_PAISE;
    case "count":
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    case "tri":
      return value === "met" || value === "not_met" || value === "unknown";
    case "tier_mode":
      return value === "single" || value === "highest_only" || value === "stacking";
    case "settlement_status":
      return value === "settled" || value === "pending" || value === "partial";
  }
}

export const factSetSchema = z.record(fieldKeySchema, factSchema).superRefine((facts, ctx) => {
  for (const [k, f] of Object.entries(facts)) {
    if (!f) continue;
    if (!valueFitsField(k as FieldKey, f.value)) ctx.addIssue({ code: "custom", path: [k, "value"], message: "invalid value for field" });
    if (f.alternative && !valueFitsField(k as FieldKey, f.alternative.value)) {
      ctx.addIssue({ code: "custom", path: [k, "alternative"], message: "invalid value for field" });
    }
  }
});

export const editFactSchema = z.object({
  expectedRevision: z.number().int().positive(),
  key: fieldKeySchema,
  fact: factSchema,
});

export const checkSchema = z.object({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

export const draftSchema = z.object({
  expectedRevision: z.number().int().positive(),
  locale: localeSchema,
  idempotencyKey: z.string().uuid(),
});

export const complaintPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), text: z.string().max(6000), expectedDraftRevision: z.number().int().positive() }),
  z.object({ action: z.literal("approve"), expectedDraftRevision: z.number().int().positive() }),
]);

export const workerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("exported"), how: z.enum(["copy", "share", "print"]) }),
  z.object({
    type: z.literal("submitted"),
    submittedOn: isoDate,
    channel: z.string().trim().min(1).max(80),
    ticketId: z.string().trim().max(60).nullable(),
  }),
  z.object({
    type: z.literal("outcome"),
    kind: z.enum(["received_full", "received_part", "declined", "no_response"]),
    amountPaise: z.number().int().nonnegative().max(MAX_ABS_PAISE).nullable(),
  }),
  z.object({ type: z.literal("follow_up"), date: isoDate.nullable() }),
]);

export const demoDraftSchema = z.object({
  fixtureId: z.enum(["A", "B", "C", "D", "E"]),
  facts: factSetSchema,
  locale: localeSchema,
  idempotencyKey: z.string().uuid(),
});

export const demoExtractSchema = z.object({ fixtureId: z.enum(["A", "B", "C", "D"]) });

export interface DraftResponse {
  text: string;
  source: "ai" | "template" | "recorded_demo";
  note: "repaired" | "template_fallback" | "validation_blocked" | null;
}

export interface ExtractResponse {
  facts: Record<string, unknown>;
  live: boolean;
  unreadable: string[];
  missing: string[];
}

export const evidenceInitSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(8 * 1024 * 1024),
  workerRedacted: z.boolean(),
});

/* Earnings ----------------------------------------------------------------- */

const paise = z.number().int().nonnegative().max(MAX_ABS_PAISE).nullable();
const signedPaise = z.number().int().min(-MAX_ABS_PAISE).max(MAX_ABS_PAISE).nullable();

export const earningsEntrySchema = z.discriminatedUnion("workType", [
  z.object({
    clientId: z.string().uuid(),
    workType: z.literal("platform"),
    periodStart: isoDate,
    periodEnd: isoDate,
    platformLabel: z.string().trim().max(60).nullable(),
    grossPaise: paise,
    adjustmentPaise: signedPaise,
    cashRetainedPaise: paise,
    advanceOffsetPaise: paise,
    payoutPaise: paise,
    fuelPaise: paise,
    otherExpensePaise: paise,
  }),
  z.object({
    clientId: z.string().uuid(),
    workType: z.literal("daily_wage"),
    periodStart: isoDate,
    periodEnd: isoDate,
    platformLabel: z.string().trim().max(60).nullable(),
    ratePaise: paise,
    fullDays: z.number().int().nonnegative().max(366).nullable(),
    halfDays: z.number().int().nonnegative().max(366).nullable(),
    paidPaise: paise,
    advancesPaise: paise,
  }),
]);
export type EarningsEntryInput = z.infer<typeof earningsEntrySchema>;
export type EarningsEntry = EarningsEntryInput & { id: string; createdAt: string; provenance: "worker_entered" };

/* AI extraction output (validated; never trusted as fact) ------------------- */

export const EXTRACTABLE_FIELDS = FIELD_KEYS.filter(
  (k) => !["fuel_expense", "other_expense", "days_unconfirmed", "offer_tier_mode"].includes(k),
);

export const extractionSchema = z.object({
  documents: z
    .array(
      z.object({
        document_id: z.string(),
        document_type: z.enum(["incentive_offer", "activity_summary", "payout_breakdown", "bank_settlement", "wage_record", "other", "unreadable"]),
        platform_as_written: z.string().max(80).nullable(),
        pay_period_start: z.string().max(20).nullable(),
        pay_period_end: z.string().max(20).nullable(),
        source_timezone: z.string().max(40).nullable(),
      }),
    )
    .max(10),
  observations: z
    .array(
      z.object({
        field_name: z.string(),
        raw_text: z.string().max(240).nullable(),
        normalized_value: z.string().max(40).nullable(),
        source_document_id: z.string(),
        source_excerpt: z.string().max(240).nullable(),
      }),
    )
    .max(60),
  unreadable_fields: z.array(z.object({ field_name: z.string(), reason: z.string().max(200) })).max(40),
  conflicting_observations: z.array(z.object({ field_name: z.string(), description: z.string().max(240) })).max(20),
  missing_information: z.array(z.string().max(200)).max(20),
});
export type Extraction = z.infer<typeof extractionSchema>;
