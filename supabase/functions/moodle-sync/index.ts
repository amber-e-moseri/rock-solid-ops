import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  withTimeout,
  classifyError,
  exponentialBackoffMs,
  shouldRetry,
  validateRequired,
  validateEmail,
  validateErrors,
  isValidPayload,
  isValidString,
  safeLogAudit,
} from "../shared-utils/edge-hardening.ts";

type SyncStatus = "PENDING" | "PROCESSING" | "SYNCED" | "FAILED" | "RETRYING" | "SKIPPED";
type MoodleFailureCode = "MOODLE_WAF_BLOCK" | "MOODLE_REST_DISABLED" | "MOODLE_PERMISSION_DENIED" | "MOODLE_403_UNKNOWN";

function json(body: unknown, status = 200) {
  return jsonResponse(
    {
      ok: (status >= 200 && status < 300) || (body as any)?.ok,
      ...(typeof body === "object" && body ? body : { data: body }),
      statusCode: status,
    },
    status,
  );
}

async function logAudit(db: ReturnType<typeof createClient>, action: string, entityId: string, status: string, details: Record<string, unknown>) {
  const statusCode = status === "SUCCESS" ? "SUCCESS" : status === "FAILED" ? "FAILED" : "SKIPPED";
  await safeLogAudit(db, {
    actor_email: "moodle-sync@system",
    action,
    entity_type: "moodle_enrollment_sync",
    entity_id: entityId,
    status: statusCode as "SUCCESS" | "FAILED" | "SKIPPED",
    details,
  });
}

async function patchSyncRow(
  db: ReturnType<typeof createClient>,
  id: string,
  patch: Record<string, unknown>,
) {
  const nowIso = new Date().toISOString();
  const base = { ...patch, updated_at: nowIso };
  const baseNoFailureReason = { ...base };
  delete baseNoFailureReason.failure_reason;
  const variants = [
    { ...base, status: base.sync_status ?? base.status ?? null },
    {
      ...base,
      status: base.sync_status ?? base.status ?? null,
      attempts: base.sync_attempts,
      moodle_course_id: base.course_id,
      error_message: base.last_error,
    },
    { ...baseNoFailureReason, status: baseNoFailureReason.sync_status ?? baseNoFailureReason.status ?? null },
  ];
  for (const v of variants) {
    const { error } = await db.from("moodle_enrollment_sync").update(v).eq("id", id);
    if (!error) return;
  }
}

function splitName(fullName: string) {
  const trimmed = String(fullName || "").trim();
  if (!trimmed) return { firstName: "Student", lastName: "" };
  const parts = trimmed.split(/\s+/g);
  return {
    firstName: parts[0] || "Student",
    lastName: parts.slice(1).join(" "),
  };
}

function safeUsernameFromEmail(email: string) {
  return String(email || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .slice(0, 80);
}

async function classify403Cause(response: Response): Promise<{ code: MoodleFailureCode; retryable: boolean; detail: string }> {
  const cfRay = response.headers.get("CF-Ray");
  const server = String(response.headers.get("Server") || "").toLowerCase();

  let body = "";
  try { body = await response.text(); } catch (_) {}
  const bodyLower = body.toLowerCase();

  if (cfRay || server.includes("cloudflare") || (bodyLower.includes("cloudflare") && !bodyLower.includes('"exception"'))) {
    return { code: "MOODLE_WAF_BLOCK", retryable: true, detail: `WAF block detected (CF-Ray: ${cfRay || "n/a"})` };
  }

  if (bodyLower.includes("access denied") && !bodyLower.includes('"exception"')) {
    return { code: "MOODLE_WAF_BLOCK", retryable: true, detail: "Access Denied without Moodle JSON — possible WAF block" };
  }

  if (bodyLower.includes("web services must be enabled") || bodyLower.includes("webservices are not enabled")) {
    return { code: "MOODLE_REST_DISABLED", retryable: false, detail: "Moodle web services are not enabled" };
  }

  try {
    const parsed = JSON.parse(body);
    if (parsed?.errorcode === "accessexception" || parsed?.errorcode === "nopermissions") {
      return { code: "MOODLE_PERMISSION_DENIED", retryable: false, detail: parsed.message || parsed.errorcode };
    }
    if (parsed?.exception || parsed?.errorcode) {
      return { code: "MOODLE_403_UNKNOWN", retryable: false, detail: parsed.message || parsed.errorcode || "Moodle 403 with unknown Moodle error" };
    }
  } catch (_) {}

  return { code: "MOODLE_403_UNKNOWN", retryable: false, detail: "HTTP 403 — cause could not be determined" };
}

async function callMoodle(url: string, token: string, wsfunction: string, params: Record<string, string>, timeoutMs = 12000) {
  const body = new URLSearchParams({
    wstoken: token,
    wsfunction,
    moodlewsrestformat: "json",
    ...params,
  });

  const response = await withTimeout(
    fetch(`${url.replace(/\/$/, "")}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
    timeoutMs,
    wsfunction,
  );

  if (!response.ok) {
    if (response.status === 403) {
      const cause = await classify403Cause(response);
      throw Object.assign(new Error(`Moodle 403 for ${wsfunction}: ${cause.code}`), { moodle403: cause });
    }
    throw new Error(`Moodle HTTP ${response.status} for ${wsfunction}`);
  }

  const data = await response.json();
  if (data?.exception) {
    throw new Error(`Moodle ${wsfunction}: ${data.message || data.exception}`);
  }

  return data;
}

async function findOrCreateMoodleUser(moodleUrl: string, moodleToken: string, email: string, fullName: string) {
  const found = await callMoodle(moodleUrl, moodleToken, "core_user_get_users", {
    "criteria[0][key]": "email",
    "criteria[0][value]": email,
  });

  const existing = Array.isArray(found?.users) ? found.users[0] : null;
  if (existing?.id) {
    return String(existing.id);
  }

  const { firstName, lastName } = splitName(fullName);
  const username = safeUsernameFromEmail(email);

  try {
    const created = await callMoodle(moodleUrl, moodleToken, "core_user_create_users", {
      "users[0][username]": username,
      "users[0][firstname]": firstName,
      "users[0][lastname]": lastName || "-",
      "users[0][email]": email,
      "users[0][auth]": "manual",
      "users[0][password]": crypto.randomUUID() + "A!1",
    });

    const createdId = Array.isArray(created) ? created[0]?.id : null;
    if (!createdId) throw new Error("Moodle user creation returned no id");
    return String(createdId);
  } catch (error) {
    const c = classifyError(error);
    if (c.code === "ALREADY_EXISTS") {
      const foundAgain = await callMoodle(moodleUrl, moodleToken, "core_user_get_users", {
        "criteria[0][key]": "email",
        "criteria[0][value]": email,
      });
      const fallback = Array.isArray(foundAgain?.users) ? foundAgain.users[0] : null;
      if (fallback?.id) return String(fallback.id);
    }
    throw error;
  }
}

async function ensureEnrollment(moodleUrl: string, moodleToken: string, userId: string, courseId: string) {
  try {
    await callMoodle(moodleUrl, moodleToken, "enrol_manual_enrol_users", {
      "enrolments[0][roleid]": "5",
      "enrolments[0][userid]": userId,
      "enrolments[0][courseid]": courseId,
    });
    return;
  } catch (error) {
    const c = classifyError(error);
    if (c.code === "ALREADY_EXISTS") return;
    throw error;
  }
}

async function resolveCourseId(db: ReturnType<typeof createClient>, row: Record<string, unknown>) {
  const explicit = String(row.course_id || "").trim();
  if (explicit) return explicit;

  const batchId = String(row.batch_id || "").trim();
  if (!batchId) return "";

  const classOptionId = String(row.class_option_id || "").trim();

  // Prefer batch-specific mapping by group if available.
  if (classOptionId) {
    const { data: classOption } = await db
      .from("class_options")
      .select("group_id")
      .eq("class_option_id", classOptionId)
      .maybeSingle();

    const groupId = String(classOption?.group_id || "").trim();
    if (groupId) {
      const { data: mapped } = await db
        .from("batch_moodle_courses")
        .select("moodle_course_id")
        .eq("batch_id", batchId)
        .eq("group_id", groupId)
        .eq("active", true)
        .maybeSingle();
      const mappedCourse = String(mapped?.moodle_course_id || "").trim();
      if (mappedCourse) return mappedCourse;
    }
  }

  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const MOODLE_URL = Deno.env.get("MOODLE_URL") || "";
    const MOODLE_TOKEN = Deno.env.get("MOODLE_TOKEN") || "";

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, error: "Missing Supabase env" }, 500);
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const payload = await req.json().catch(() => ({}));

    if (!isValidPayload(payload)) {
      return json({ ok: false, error: "Invalid payload", code: "INVALID_PAYLOAD" }, 400);
    }

    // Test action: live Moodle connectivity check via core_webservice_get_site_info
    if (String(payload?.action || "").trim() === "test") {
      if (!MOODLE_URL || !MOODLE_TOKEN) {
        return json({ ok: false, code: "MOODLE_NOT_CONFIGURED", error: "MOODLE_URL or MOODLE_TOKEN not set", moodleUrl: null });
      }
      try {
        const info = await callMoodle(MOODLE_URL, MOODLE_TOKEN, "core_webservice_get_site_info", {});
        return json({ ok: true, test: "moodle_connectivity", sitename: info?.sitename || "", siteurl: info?.siteurl || "", moodleUrl: MOODLE_URL });
      } catch (testErr) {
        const moodle403 = (testErr as any)?.moodle403 as { code: MoodleFailureCode; retryable: boolean; detail: string } | undefined;
        if (moodle403) {
          return json({ ok: false, test: "moodle_connectivity", error: moodle403.detail, code: moodle403.code, failure_reason: moodle403.code, moodleUrl: MOODLE_URL });
        }
        const c = classifyError(testErr);
        return json({ ok: false, test: "moodle_connectivity", error: c.message, code: c.code, moodleUrl: MOODLE_URL });
      }
    }

    const forceId = String(payload?.id || "").trim();
    const limitInput = Number(payload?.limit || 5) || 5;
    const limit = Math.max(1, Math.min(50, limitInput)); // Max 50 to prevent abuse

    const baseQuery = db
      .from("moodle_enrollment_sync")
      .select("*")
      .in("sync_status", ["PENDING", "RETRYING", "FAILED"])
      .eq("registration_status", "ASSIGNED")
      .order("updated_at", { ascending: true })
      .limit(limit);

    const { data: rows, error: rowsError } = forceId
      ? await db
          .from("moodle_enrollment_sync")
          .select("*")
          .eq("id", forceId)
          .limit(1)
      : await baseQuery;

    if (rowsError) throw rowsError;

    const jobs = (rows || []) as Array<Record<string, unknown>>;
    if (!jobs.length) {
      return json({ ok: true, processed: 0, message: "No moodle enrollment jobs pending" });
    }

    const summary = {
      processed: 0,
      synced: 0,
      failed: 0,
      skipped: 0,
      failures: [] as Array<{ id: string; code: string; message: string }>,
    };

    for (const row of jobs) {
      const id = String(row.id || "").trim();
      const email = String(row.email || "").trim().toLowerCase();
      const fullName = String(row.full_name || "").trim();
      const traceId = String(row.trace_id || (row.payload as Record<string, unknown> | undefined)?.trace_id || "").trim();
      const registrationStatus = String(row.registration_status || "").toUpperCase();
      const retryCount = Number(row.retry_count || 0);
      const maxRetries = 5;

      summary.processed += 1;

      if (!id) continue;

      // Validate input before processing
      const emailErr = validateEmail(email, "email");
      if (emailErr && registrationStatus === "ASSIGNED") {
        await patchSyncRow(db, id, {
          sync_status: "FAILED",
          error_code: "INVALID_PAYLOAD",
          last_error: "Invalid email format",
          error_message: "Invalid email format",
          sync_attempts: Number(row.sync_attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
        });
        summary.failed += 1;
        summary.failures.push({ id, code: "INVALID_PAYLOAD", message: "Invalid email format" });
        await logAudit(db, "MOODLE_SYNC_FAILED", id, "FAILED", {
          reason: "Invalid email format",
          ...(traceId ? { trace_id: traceId } : {}),
        });
        continue;
      }

      if (registrationStatus !== "ASSIGNED") {
        await patchSyncRow(db, id, {
          sync_status: "SKIPPED",
          last_error: "Not ASSIGNED",
          error_message: "Not ASSIGNED",
        });
        summary.skipped += 1;
        continue;
      }

      // Check if exceeded max retries
      if (retryCount > maxRetries) {
        await patchSyncRow(db, id, {
          sync_status: "FAILED",
          error_code: "MAX_RETRIES_EXCEEDED",
          last_error: `Exceeded maximum retry limit (${maxRetries})`,
          error_message: `Exceeded maximum retry limit (${maxRetries})`,
        });
        summary.failed += 1;
        summary.failures.push({
          id,
          code: "MAX_RETRIES_EXCEEDED",
          message: `Exceeded maximum retry limit (${maxRetries})`,
        });
        await logAudit(db, "MOODLE_SYNC_FAILED", id, "FAILED", {
          reason: "Max retries exceeded",
          retry_count: retryCount,
          ...(traceId ? { trace_id: traceId } : {}),
        });
        continue;
      }

      const nowIso = new Date().toISOString();
      await patchSyncRow(db, id, {
        sync_status: "PROCESSING",
        sync_attempts: Number(row.sync_attempts || 0) + 1,
        last_attempt_at: nowIso,
      });

      try {
        if (!MOODLE_URL || !MOODLE_TOKEN) {
          throw new Error("Moodle environment is not configured");
        }

        const courseId = await resolveCourseId(db, row);
        if (!courseId) {
          throw new Error("No Moodle course mapping found for this assignment");
        }

        const moodleUserId = await findOrCreateMoodleUser(MOODLE_URL, MOODLE_TOKEN, email, fullName);
        await ensureEnrollment(MOODLE_URL, MOODLE_TOKEN, moodleUserId, courseId);

        await patchSyncRow(db, id, {
          sync_status: "SYNCED" satisfies SyncStatus,
          moodle_user_id: moodleUserId,
          course_id: courseId,
          moodle_course_id: courseId,
          synced_at: nowIso,
          last_error: null,
          error_message: null,
          error_code: null,
        });

        await logAudit(db, "MOODLE_SYNC_SUCCESS", id, "SUCCESS", {
          email,
          course_id: courseId,
          moodle_user_id: moodleUserId,
          ...(traceId ? { trace_id: traceId } : {}),
        });

        summary.synced += 1;
      } catch (error) {
        const moodle403 = (error as any)?.moodle403 as { code: MoodleFailureCode; retryable: boolean; detail: string } | undefined;

        let errorCodeStr: string;
        let errorMsg: string;
        let isRetryable: boolean;
        let isRateLimit: boolean;

        if (moodle403) {
          errorCodeStr = moodle403.code;
          errorMsg = moodle403.detail;
          isRetryable = moodle403.retryable;
          isRateLimit = false;
        } else {
          const c = classifyError(error);
          errorCodeStr = c.code;
          errorMsg = c.message;
          isRetryable = c.retryable;
          isRateLimit = c.code === "RATE_LIMIT";
        }

        const nextRetryCount = retryCount + 1;
        const canRetry = shouldRetry(nextRetryCount, maxRetries, isRetryable, isRateLimit);
        const failureStatus: SyncStatus = canRetry ? "RETRYING" : "FAILED";
        const backoffMs = canRetry ? exponentialBackoffMs(nextRetryCount, 1000, 60000) : undefined;

        const patchData: Record<string, unknown> = {
          sync_status: failureStatus,
          error_code: errorCodeStr,
          last_error: errorMsg,
          error_message: errorMsg,
          retry_count: nextRetryCount,
          retry_requested_at: canRetry ? nowIso : null,
          next_retry_at: canRetry ? new Date(Date.now() + backoffMs!).toISOString() : null,
        };
        if (moodle403) {
          patchData.failure_reason = moodle403.code;
        }

        await patchSyncRow(db, id, patchData);

        try {
          const existing = await db
            .from("failed_syncs")
            .select("id")
            .eq("source_table", "moodle_enrollment_sync")
            .eq("source_id", id)
            .maybeSingle();

          if (existing.data?.id) {
            await db
              .from("failed_syncs")
              .update({
                sync_type: "moodle",
                status: failureStatus === "RETRYING" ? "RETRYING" : "FAILED",
                error_message: errorMsg,
                retry_count: nextRetryCount,
                last_retry_at: nowIso,
                updated_at: nowIso,
              })
              .eq("id", existing.data.id);
          } else {
            await db
              .from("failed_syncs")
              .insert({
                source_table: "moodle_enrollment_sync",
                source_id: id,
                sync_type: "moodle",
                status: failureStatus === "RETRYING" ? "RETRYING" : "FAILED",
                error_message: errorMsg,
                retry_count: nextRetryCount,
                last_retry_at: nowIso,
                created_at: nowIso,
                updated_at: nowIso,
              });
          }
        } catch (_) {
          // failed_syncs is optional for visibility; keep enrollment sync state as source of truth.
        }

        await logAudit(db, "MOODLE_SYNC_FAILED", id, "FAILED", {
          code: errorCodeStr,
          message: errorMsg,
          retryable: isRetryable,
          retry_count: nextRetryCount,
          next_attempt_ms: backoffMs,
          ...(traceId ? { trace_id: traceId } : {}),
          ...(moodle403 ? { failure_reason: moodle403.code } : {}),
        });

        summary.failed += 1;
        summary.failures.push({ id, code: errorCodeStr, message: errorMsg });
      }
    }

    return json({ ok: true, ...summary });
  } catch (error) {
    const c = classifyError(error);
    return json({ ok: false, error: c.message, code: c.code }, c.statusCode);
  }
});
