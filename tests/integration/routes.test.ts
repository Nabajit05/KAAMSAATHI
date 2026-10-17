/**
 * Calls the real route handlers with NextRequest objects. No AI key is set in
 * tests, so these cover the honest fallbacks and input validation paths.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmFact, type FactSet } from "@/domain/facts";
import { FIXTURES } from "@/fixtures/demo";

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.resetModules();
});

function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", host: "localhost:3000", origin: "http://localhost:3000", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers },
  });
}

const confirmed = (id: "A" | "B" | "C"): FactSet => {
  const out: FactSet = {};
  for (const [k, f] of Object.entries(FIXTURES[id].facts)) if (f) out[k as keyof FactSet] = confirmFact(f);
  return out;
};

describe("demo complaint route", () => {
  it("returns a labelled factual template when AI is not configured", async () => {
    const { POST } = await import("@/app/api/demo/complaint/route");
    const res = await POST(req("/api/demo/complaint", { fixtureId: "A", facts: confirmed("A"), locale: "en", idempotencyKey: crypto.randomUUID() }), undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("template");
    expect(body.note).toBe("template_fallback");
    expect(body.text).toContain("Difference: ₹300");
  });

  it("refuses to draft from unreviewed facts", async () => {
    const { POST } = await import("@/app/api/demo/complaint/route");
    const res = await POST(req("/api/demo/complaint", { fixtureId: "A", facts: FIXTURES.A.facts, locale: "en", idempotencyKey: crypto.randomUUID() }), undefined);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.requestId).toBeTruthy();
  });

  it("rejects values of the wrong type for a field", async () => {
    const { POST } = await import("@/app/api/demo/complaint/route");
    const facts = confirmed("A");
    facts.qualifying_orders = { ...facts.qualifying_orders!, value: "lots" };
    const res = await POST(req("/api/demo/complaint", { fixtureId: "A", facts, locale: "en", idempotencyKey: crypto.randomUUID() }), undefined);
    expect(res.status).toBe(422);
  });

  it("rejects cross-site requests (CSRF origin check)", async () => {
    const { POST } = await import("@/app/api/demo/complaint/route");
    const res = await POST(
      req("/api/demo/complaint", { fixtureId: "A", facts: confirmed("A"), locale: "en", idempotencyKey: crypto.randomUUID() }, { origin: "https://evil.example" }),
      undefined,
    );
    expect(res.status).toBe(403);
  });

  it("returns the same result for a repeated idempotency key", async () => {
    const { POST } = await import("@/app/api/demo/complaint/route");
    const key = crypto.randomUUID();
    const body = { fixtureId: "A", facts: confirmed("A"), locale: "hi", idempotencyKey: key };
    const a = await (await POST(req("/api/demo/complaint", body), undefined)).json();
    const b = await (await POST(req("/api/demo/complaint", body), undefined)).json();
    expect(b).toEqual(a);
  });

  it("does not leak stack traces on malformed JSON", async () => {
    const { POST } = await import("@/app/api/demo/complaint/route");
    const r = new NextRequest("http://localhost:3000/api/demo/complaint", {
      method: "POST",
      body: "{not json",
      headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    });
    const res = await POST(r, undefined);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/at .*\.ts/);
  });
});

describe("demo extract route", () => {
  it("reports not configured instead of pretending to read live", async () => {
    const { POST } = await import("@/app/api/demo/extract/route");
    const res = await POST(req("/api/demo/extract", { fixtureId: "A" }), undefined);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not_configured");
  });
});

describe("health route", () => {
  it("returns booleans only", async () => {
    const { GET } = await import("@/app/api/health/route");
    const body = await GET().json();
    expect(body.ai).toBe(false);
    for (const v of Object.values(body)) expect(["boolean", "string"]).toContain(typeof v);
    expect(JSON.stringify(body)).not.toMatch(/key|secret|token/i);
  });
});
