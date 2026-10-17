"use client";

import {
  newCase,
  withCheck,
  withComplaint,
  withComplaintApproved,
  withComplaintText,
  withExported,
  withFact,
  withFollowUp,
  withOutcome,
  withSubmission,
  type CaseRecord,
  type Locale,
  type WorkerOutcome,
  type WorkerSubmission,
} from "@/domain/case";
import type { Fact, FactSet, FieldKey } from "@/domain/facts";
import { fixtureCase, type FixtureId } from "@/fixtures/demo";
import { ApiError, type ApiErrorBody } from "@/shared/errors";
import type { CreateCaseInput, DraftResponse, ExtractResponse } from "@/shared/contracts";

/**
 * Demo cases are fictional and live only in this tab's sessionStorage.
 * Private cases live on the server; every change goes through an
 * authenticated route that re-applies the same domain rules.
 */
const DEMO_KEY = "hc_demo_cases";

export const isDemoId = (id: string) => id.startsWith("demo-");

function readDemo(): Record<string, CaseRecord> {
  try {
    return JSON.parse(window.sessionStorage.getItem(DEMO_KEY) ?? "{}") as Record<string, CaseRecord>;
  } catch {
    return {};
  }
}

function writeDemo(all: Record<string, CaseRecord>) {
  try {
    window.sessionStorage.setItem(DEMO_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: demo still works for this page view */
  }
}

const memoryDemo: Record<string, CaseRecord> = {};

function saveDemo(c: CaseRecord): CaseRecord {
  memoryDemo[c.id] = c;
  const all = readDemo();
  all[c.id] = c;
  writeDemo(all);
  return c;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { json, timeoutMs = 45_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: controller.signal,
      credentials: "same-origin",
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") throw new ApiError("timeout", "timeout", 0, true);
    throw new ApiError("internal", "network", 0, true);
  }
  clearTimeout(timer);
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error */
    }
    const e = body?.error;
    throw new ApiError(e?.code ?? "internal", e?.message ?? res.statusText, res.status, e?.retryable ?? res.status >= 500, e?.requestId ?? null, e?.fields);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export const caseClient = {
  async list(): Promise<CaseRecord[]> {
    const demo = Object.values({ ...readDemo(), ...memoryDemo });
    let mine: CaseRecord[] = [];
    try {
      mine = (await api<{ cases: CaseRecord[] }>("/api/cases")).cases;
    } catch (e) {
      if (!(e instanceof ApiError) || (e.code !== "unauthorized" && e.code !== "not_configured")) throw e;
    }
    return [...mine, ...demo].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id: string): Promise<CaseRecord | null> {
    if (isDemoId(id)) return memoryDemo[id] ?? readDemo()[id] ?? null;
    return (await api<{ case: CaseRecord }>(`/api/cases/${encodeURIComponent(id)}`)).case;
  },

  createDemo(fixture: FixtureId, locale: Locale): CaseRecord {
    const c = fixtureCase(fixture, locale);
    return saveDemo({ ...c, id: `demo-${c.id}` });
  },

  async create(input: CreateCaseInput): Promise<CaseRecord> {
    return (await api<{ case: CaseRecord }>("/api/cases", { method: "POST", json: input })).case;
  },

  async editFact(c: CaseRecord, key: FieldKey, fact: Fact): Promise<CaseRecord> {
    if (c.mode === "demo") return saveDemo(withFact(c, key, fact));
    return (
      await api<{ case: CaseRecord }>(`/api/cases/${c.id}/facts`, {
        method: "PATCH",
        json: { expectedRevision: c.inputRevision, key, fact },
      })
    ).case;
  },

  async runCheck(c: CaseRecord): Promise<CaseRecord> {
    if (c.mode === "demo") return saveDemo(withCheck(c));
    return (
      await api<{ case: CaseRecord }>(`/api/cases/${c.id}/check`, {
        method: "POST",
        json: { expectedRevision: c.inputRevision, idempotencyKey: newIdempotencyKey() },
      })
    ).case;
  },

  async draftComplaint(c: CaseRecord, locale: Locale, idempotencyKey: string): Promise<{ case: CaseRecord; note: DraftResponse["note"] }> {
    if (c.mode === "demo") {
      const res = await api<DraftResponse>("/api/demo/complaint", {
        method: "POST",
        json: { fixtureId: c.fixtureId, facts: c.facts, locale, idempotencyKey },
      });
      const next = saveDemo(withComplaint(c, { locale, text: res.text, source: res.source }));
      return { case: next, note: res.note };
    }
    const res = await api<{ case: CaseRecord; note: DraftResponse["note"] }>(`/api/cases/${c.id}/complaint`, {
      method: "POST",
      json: { expectedRevision: c.inputRevision, locale, idempotencyKey },
    });
    return res;
  },

  async setComplaintText(c: CaseRecord, text: string): Promise<CaseRecord> {
    if (c.mode === "demo") return saveDemo(withComplaintText(c, text));
    return (
      await api<{ case: CaseRecord }>(`/api/cases/${c.id}/complaint`, {
        method: "PATCH",
        json: { action: "edit", text, expectedDraftRevision: c.complaint?.revision },
      })
    ).case;
  },

  async approveComplaint(c: CaseRecord): Promise<CaseRecord> {
    if (c.mode === "demo") return saveDemo(withComplaintApproved(c));
    return (
      await api<{ case: CaseRecord }>(`/api/cases/${c.id}/complaint`, {
        method: "PATCH",
        json: { action: "approve", expectedDraftRevision: c.complaint?.revision },
      })
    ).case;
  },

  async markExported(c: CaseRecord, how: "copy" | "share" | "print"): Promise<CaseRecord> {
    if (c.mode === "demo") return saveDemo(withExported(c, how));
    return (await api<{ case: CaseRecord }>(`/api/cases/${c.id}/events`, { method: "POST", json: { type: "exported", how } })).case;
  },

  async reportSubmission(c: CaseRecord, s: WorkerSubmission): Promise<CaseRecord> {
    if (c.mode === "demo") return saveDemo(withSubmission(c, s));
    return (await api<{ case: CaseRecord }>(`/api/cases/${c.id}/events`, { method: "POST", json: { type: "submitted", ...s } })).case;
  },

  async reportOutcome(c: CaseRecord, o: Omit<WorkerOutcome, "reportedOn">): Promise<CaseRecord> {
    const outcome: WorkerOutcome = { ...o, reportedOn: new Date().toISOString().slice(0, 10) };
    if (c.mode === "demo") return saveDemo(withOutcome(c, outcome));
    return (await api<{ case: CaseRecord }>(`/api/cases/${c.id}/events`, { method: "POST", json: { type: "outcome", ...o } })).case;
  },

  async setFollowUp(c: CaseRecord, date: string | null): Promise<CaseRecord> {
    if (c.mode === "demo") return saveDemo(withFollowUp(c, date));
    return (await api<{ case: CaseRecord }>(`/api/cases/${c.id}/events`, { method: "POST", json: { type: "follow_up", date } })).case;
  },

  /** Demo only: ask the AI to read the fictional sample images live. */
  async readSampleLive(c: CaseRecord): Promise<CaseRecord> {
    const res = await api<ExtractResponse>("/api/demo/extract", { method: "POST", json: { fixtureId: c.fixtureId } });
    const next: CaseRecord = {
      ...c,
      facts: res.facts as FactSet,
      inputRevision: c.inputRevision + 1,
      check: null,
      complaint: null,
      updatedAt: new Date().toISOString(),
      events: [...c.events, { id: crypto.randomUUID(), type: "records_read", at: new Date().toISOString(), actor: "system", meta: { live: 1 } }],
    };
    return saveDemo(next);
  },

  async extract(c: CaseRecord, idempotencyKey: string): Promise<CaseRecord> {
    return (
      await api<{ case: CaseRecord }>(`/api/cases/${c.id}/extract`, {
        method: "POST",
        json: { expectedRevision: c.inputRevision, idempotencyKey },
        timeoutMs: 90_000,
      })
    ).case;
  },

  async remove(c: CaseRecord): Promise<{ status: "deleted" | "pending" }> {
    if (c.mode === "demo") {
      delete memoryDemo[c.id];
      const all = readDemo();
      delete all[c.id];
      writeDemo(all);
      return { status: "deleted" };
    }
    return api<{ status: "deleted" | "pending" }>(`/api/cases/${c.id}`, { method: "DELETE" });
  },

  newLocalDraft(init: Pick<CaseRecord, "workType" | "issueType">): CaseRecord {
    return newCase({ mode: "private", ...init });
  },
};
