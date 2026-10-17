import type { FactSet, FieldKey } from "@/domain/facts";

/**
 * Merges newly extracted facts into a case without overwriting anything the
 * worker already confirmed or entered. If a new record disagrees with the
 * worker's value, both are kept as a conflict for the worker to resolve.
 */
export function mergeExtracted(existing: FactSet, extracted: FactSet): FactSet {
  const out: FactSet = { ...existing };
  for (const [k, incoming] of Object.entries(extracted) as [FieldKey, NonNullable<FactSet[FieldKey]>][]) {
    const cur = existing[k];
    if (!cur || cur.reviewState === "unreadable" || (cur.reviewState === "unreviewed" && cur.value === null)) {
      out[k] = incoming;
      continue;
    }
    if (incoming.value === null || incoming.value === cur.value) continue;
    const workerOwned = cur.provenance !== "record" && (cur.reviewState === "confirmed" || cur.reviewState === "edited");
    if (workerOwned || cur.reviewState === "confirmed") {
      out[k] = {
        ...incoming,
        reviewState: "conflict",
        alternative: { value: cur.value, provenance: cur.provenance ?? "worker_entered", sourceDocumentId: cur.sourceDocumentId, sourceExcerpt: cur.sourceExcerpt },
      };
    } else {
      // Two unreviewed record values disagree: keep both.
      out[k] = {
        ...cur,
        reviewState: "conflict",
        alternative: { value: incoming.value, provenance: "record", sourceDocumentId: incoming.sourceDocumentId, sourceExcerpt: incoming.sourceExcerpt },
      };
    }
  }
  return out;
}
