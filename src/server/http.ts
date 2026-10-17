import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ApiErrorBody, ErrorCode } from "@/shared/errors";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden_origin: 403,
  not_found: 404,
  revision_conflict: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  ai_unavailable: 503,
  ai_invalid_output: 502,
  timeout: 504,
  file_rejected: 422,
  not_configured: 503,
  partial_failure: 207,
  internal: 500,
};

const RETRYABLE = new Set<ErrorCode>(["rate_limited", "ai_unavailable", "timeout", "internal", "partial_failure"]);

export class HttpError extends Error {
  constructor(
    public code: ErrorCode,
    message: string = code,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function errorResponse(code: ErrorCode, requestId: string, message?: string, fields?: Record<string, string>) {
  const body: ApiErrorBody = {
    error: { code, message: message ?? code, retryable: RETRYABLE.has(code), requestId, ...(fields ? { fields } : {}) },
  };
  return NextResponse.json(body, { status: STATUS[code], headers: { "cache-control": "no-store" } });
}

/**
 * Logs only operation metadata (route, error category, request id) — never
 * request bodies, document text, transcripts, phone numbers or secrets.
 */
export function logOp(event: string, meta: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...meta }));
}

/**
 * Strict same-origin check for cookie-authenticated mutations (CSRF defence).
 * Browsers always send Origin on cross-site POST/PATCH/DELETE.
 */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError("forbidden_origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError("forbidden_origin");
  }
  if (originHost !== host) throw new HttpError("forbidden_origin");
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>, maxBytes = 64_000): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError("bad_request", "body too large");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new HttpError("bad_request", "body too large");
    raw = JSON.parse(text);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("bad_request", "invalid json");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError("validation_failed", "invalid input", zodFields(r.error));
  return r.data;
}

function zodFields(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues.slice(0, 10)) out[issue.path.join(".") || "_"] = issue.message;
  return out;
}

/** Wraps a route handler with request ids, origin checks and safe error mapping. */
export function route<C>(handler: (req: NextRequest, ctx: C, requestId: string) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const requestId = newRequestId();
    try {
      assertSameOrigin(req);
      const res = await handler(req, ctx, requestId);
      res.headers.set("x-request-id", requestId);
      if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
      return res;
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.code === "internal") logOp("error", { route: req.nextUrl.pathname, code: e.code, requestId });
        return errorResponse(e.code, requestId, e.message, e.fields);
      }
      logOp("error", { route: req.nextUrl.pathname, code: "internal", requestId, kind: (e as Error)?.name ?? "unknown" });
      return errorResponse("internal", requestId);
    }
  };
}

/* In-memory rate limiting --------------------------------------------------
 * Bounds bursts per instance. It is not shared across serverless instances;
 * durable per-user quotas for billed AI calls are enforced in the database.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    }
    return;
  }
  b.count += 1;
  if (b.count > limit) throw new HttpError("rate_limited");
}

export function clientIp(req: NextRequest): string {
  // x-real-ip is set by the hosting proxy (e.g. Vercel); the first X-Forwarded-For hop can be spoofed by clients.
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}
