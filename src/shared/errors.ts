/** Stable error codes shared by API and client. Messages are localized on the client. */
export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden_origin"
  | "not_found"
  | "revision_conflict"
  | "rate_limited"
  | "quota_exceeded"
  | "ai_unavailable"
  | "ai_invalid_output"
  | "timeout"
  | "file_rejected"
  | "not_configured"
  | "partial_failure"
  | "internal";

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
    fields?: Record<string, string>;
  };
}

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status: number,
    public retryable = false,
    public requestId: string | null = null,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Maps an error code to the localized message key shown to workers. */
export function errorMessageKey(code: ErrorCode | "network"): string {
  switch (code) {
    case "network":
      return "error.network";
    case "timeout":
      return "error.timeout";
    case "not_found":
      return "error.notFound";
    case "quota_exceeded":
    case "rate_limited":
      return "error.quota";
    case "ai_unavailable":
    case "ai_invalid_output":
      return "error.aiUnavailable";
    case "revision_conflict":
      return "error.conflict";
    case "unauthorized":
      return "error.unauthorized";
    case "not_configured":
      return "error.maintenance";
    default:
      return "error.generic";
  }
}
