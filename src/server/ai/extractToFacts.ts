import { FIELD_KEYS, type Fact, type FactSet, type FieldKey } from "@/domain/facts";
import { parseFieldValue } from "@/domain/parseField";
import { extractionSchema, type Extraction } from "@/shared/contracts";

/**
 * Turns validated model output into unreviewed facts. Schema compliance is
 * not factual correctness: every value is re-parsed by our own parsers,
 * unknown fields and document ids are dropped, disagreements between
 * documents are kept as conflicts, and nothing is marked confirmed.
 */
export function validateExtraction(raw: unknown): { ok: true; value: Extraction } | { ok: false } {
  const r = extractionSchema.safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false };
}

const clip = (s: string | null, n = 160) => (s ? s.replace(/\s+/g, " ").trim().slice(0, n) : null);

export function extractionToFacts(x: Extraction, allowedDocIds: string[]): { facts: FactSet; unreadable: FieldKey[]; missing: string[] } {
  const allowed = new Set(allowedDocIds);
  const facts: FactSet = {};
  const isField = (f: string): f is FieldKey => (FIELD_KEYS as string[]).includes(f);

  for (const o of x.observations) {
    if (!isField(o.field_name) || !allowed.has(o.source_document_id) || o.normalized_value === null) continue;
    const parsed = parseFieldValue(o.field_name, o.normalized_value);
    if (!parsed.ok) continue;
    const incoming: Fact = {
      value: parsed.value,
      provenance: "record",
      reviewState: "unreviewed",
      sourceDocumentId: o.source_document_id,
      sourceExcerpt: clip(o.source_excerpt),
      rawText: clip(o.raw_text),
      unknownReason: null,
      alternative: null,
    };
    const existing = facts[o.field_name];
    if (!existing) {
      facts[o.field_name] = incoming;
    } else if (existing.value !== incoming.value && !existing.alternative) {
      // Two records disagree: keep both and make the worker choose.
      facts[o.field_name] = {
        ...existing,
        reviewState: "conflict",
        alternative: {
          value: incoming.value,
          provenance: "record",
          sourceDocumentId: incoming.sourceDocumentId,
          sourceExcerpt: incoming.sourceExcerpt,
        },
      };
    }
    // Same value from a duplicate screenshot: keep the first source only.
  }

  const unreadable: FieldKey[] = [];
  for (const u of x.unreadable_fields) {
    if (!isField(u.field_name) || facts[u.field_name]) continue;
    unreadable.push(u.field_name);
    facts[u.field_name] = {
      value: null,
      provenance: "record",
      reviewState: "unreadable",
      sourceDocumentId: null,
      sourceExcerpt: null,
      rawText: null,
      unknownReason: clip(u.reason, 200),
      alternative: null,
    };
  }

  return { facts, unreadable, missing: x.missing_information.map((m) => m.slice(0, 200)).slice(0, 10) };
}
