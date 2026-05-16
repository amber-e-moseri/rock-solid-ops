/**
 * Shared Edge Function hardening utilities.
 * Provides input validation, error classification, rate limiting, and observability.
 */

// ── Error Classification ──
export interface ErrorClassification {
  code: string;
  message: string;
  retryable: boolean;
  statusCode: number;
  isUserError: boolean;
}

export function classifyError(error: unknown, defaultRetryable = true): ErrorClassification {
  const msg = error instanceof Error ? error.message : String(error || "Unknown error");
  const lower = msg.toLowerCase();

  // Network errors (retryable)
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      code: "TIMEOUT",
      message: msg,
      retryable: true,
      statusCode: 504,
      isUserError: false,
    };
  }

  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("econn") ||
    lower.includes("econnrefused") ||
    lower.includes("dns")
  ) {
    return {
      code: "NETWORK",
      message: msg,
      retryable: true,
      statusCode: 503,
      isUserError: false,
    };
  }

  // Auth errors (non-retryable)
  if (
    lower.includes("invalid token") ||
    lower.includes("access denied") ||
    lower.includes("permission denied") ||
    lower.includes("unauthorized") ||
    lower.includes("jwt")
  ) {
    return {
      code: "AUTH",
      message: msg,
      retryable: false,
      statusCode: 401,
      isUserError: false,
    };
  }

  // Conflict/duplicate — must be before INVALID_INPUT ("already exists" contains "invalid")
  if (
    lower.includes("already exists") ||
    lower.includes("already enrolled") ||
    lower.includes("duplicate") ||
    lower.includes("conflict")
  ) {
    return {
      code: "ALREADY_EXISTS",
      message: msg,
      retryable: false,
      statusCode: 409,
      isUserError: false,
    };
  }

  // Input validation errors (non-retryable, user error)
  if (
    lower.includes("invalid") ||
    lower.includes("missing") ||
    lower.includes("required") ||
    lower.includes("malformed")
  ) {
    return {
      code: "INVALID_INPUT",
      message: msg,
      retryable: false,
      statusCode: 400,
      isUserError: true,
    };
  }

  // Not found (non-retryable)
  if (lower.includes("not found") || lower.includes("does not exist")) {
    return {
      code: "NOT_FOUND",
      message: msg,
      retryable: false,
      statusCode: 404,
      isUserError: true,
    };
  }

  // WAF/403 (non-retryable)
  if (lower.includes("http 403") || lower.includes("forbidden")) {
    return {
      code: "FORBIDDEN",
      message: msg,
      retryable: false,
      statusCode: 403,
      isUserError: false,
    };
  }

  // Rate limit (retryable with backoff)
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return {
      code: "RATE_LIMIT",
      message: msg,
      retryable: true,
      statusCode: 429,
      isUserError: false,
    };
  }

  // Default: treat as retryable system error
  return {
    code: "UNKNOWN",
    message: msg,
    retryable: defaultRetryable,
    statusCode: 500,
    isUserError: false,
  };
}

// ── Input Validation ──
export interface ValidationError {
  field: string;
  message: string;
}

export function validateRequired(value: unknown, fieldName: string): ValidationError | null {
  const str = String(value || "").trim();
  if (!str) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  return null;
}

export function validateEmail(email: string, fieldName = "email"): ValidationError | null {
  const str = String(email || "").trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(str)) {
    return { field: fieldName, message: `${fieldName} is not a valid email address` };
  }
  return null;
}

export function validateId(id: unknown, fieldName = "id"): ValidationError | null {
  const str = String(id || "").trim();
  if (!str || str.length > 255) {
    return { field: fieldName, message: `${fieldName} must be a non-empty string (max 255 chars)` };
  }
  return null;
}

export function validateUUID(uuid: unknown, fieldName = "uuid"): ValidationError | null {
  const str = String(uuid || "").trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(str)) {
    return { field: fieldName, message: `${fieldName} must be a valid UUID` };
  }
  return null;
}

export function validateInteger(
  value: unknown,
  fieldName = "value",
  min?: number,
  max?: number,
): ValidationError | null {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    return { field: fieldName, message: `${fieldName} must be an integer` };
  }
  if (min !== undefined && num < min) {
    return { field: fieldName, message: `${fieldName} must be at least ${min}` };
  }
  if (max !== undefined && num > max) {
    return { field: fieldName, message: `${fieldName} must be at most ${max}` };
  }
  return null;
}

export function validateArray(
  value: unknown,
  fieldName = "array",
  minLength = 0,
  maxLength = Infinity,
): ValidationError | null {
  if (!Array.isArray(value)) {
    return { field: fieldName, message: `${fieldName} must be an array` };
  }
  if (value.length < minLength) {
    return { field: fieldName, message: `${fieldName} must have at least ${minLength} items` };
  }
  if (value.length > maxLength) {
    return { field: fieldName, message: `${fieldName} must have at most ${maxLength} items` };
  }
  return null;
}

export function validateErrors(...errors: (ValidationError | null)[]): ValidationError[] {
  return errors.filter((e): e is ValidationError => e !== null);
}

// ── Rate Limiting & Backoff ──
export function exponentialBackoffMs(attempt: number, baseDelayMs = 1000, maxDelayMs = 60000): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.1 * delay;
  return Math.floor(delay + jitter);
}

export function shouldRetry(
  attempt: number,
  maxAttempts = 5,
  isRetryable = true,
  isRateLimit = false,
): boolean {
  if (!isRetryable || attempt > maxAttempts) {
    return false;
  }
  // Rate limits get more retries (exponential backoff)
  if (isRateLimit && attempt <= Math.max(maxAttempts, 10)) {
    return true;
  }
  return true;
}

// ── Timeout Wrapper ──
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`TIMEOUT:${label} (${timeoutMs}ms)`)),
      timeoutMs,
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

// ── Request/Response Helpers ──
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function applyAllowedOrigin(req: Request): void {
  const allowed = String(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const origin = String(req.headers.get("Origin") || "").trim();
  if (origin && allowed.includes(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
  } else {
    delete corsHeaders["Access-Control-Allow-Origin"];
  }
}

export interface EdgeFunctionResponse<T> {
  ok: boolean;
  error?: string;
  code?: string;
  data?: T;
  statusCode: number;
}

export function jsonResponse<T>(
  body: EdgeFunctionResponse<T>,
  statusCode?: number,
): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode || body.statusCode || 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(
  message: string,
  classification: ErrorClassification,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: message,
      code: classification.code,
      statusCode: classification.statusCode,
    },
    classification.statusCode,
  );
}

// ── Audit Logging ──
export interface AuditLogPayload {
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  details: Record<string, unknown>;
  logged_at?: string;
}

export async function safeLogAudit(
  db: any,
  payload: AuditLogPayload,
): Promise<boolean> {
  const fullPayload = { ...payload };

  // Canonical table established by 202605071800_audit_logs_canonicalization.sql.
  try {
    const { error } = await db.from("audit_logs").insert(fullPayload);
    return !error;
  } catch (_) {
    return false;
  }
}

// ── Type Guards ──
export function isValidPayload(payload: unknown): payload is Record<string, unknown> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload);
}

export function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidEmail(value: unknown): value is string {
  if (!isValidString(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}
