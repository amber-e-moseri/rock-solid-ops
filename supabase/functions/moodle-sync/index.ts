import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SyncStatus = "PENDING" | "PROCESSING" | "SYNCED" | "FAILED" | "RETRYING" | "SKIPPED";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), timeoutMs);
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

function classifyError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || "Unknown error");
  const lower = msg.toLowerCase();

  if (lower.includes("moodle http 403")) {
    return {
      code: "MOODLE_AUTH_OR_WAF_BLOCKED",
      message:
        "Moodle rejected this request (HTTP 403). Check MOODLE_TOKEN permissions or upstream WAF/security rules.",
      retryable: false,
    };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { code: "TIMEOUT", message: msg, retryable: true };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("econn") || lower.includes("dns")) {
    return { code: "NETWORK", message: msg, retryable: true };
  }
  if (lower.includes("no moodle course mapping found")) {
    return {
      code: "COURSE_MAPPING_MISSING",
      message: "No Moodle course mapping found for this assigned student/class.",
      retryable: false,
    };
  }
  if (lower.includes("invalid token") || lower.includes("access denied") || lower.includes("permission")) {
    return { code: "AUTH", message: msg, retryable: false };
  }
  if (lower.includes("already enrolled") || lower.includes("already exists")) {
    return { code: "ALREADY_EXISTS", message: msg, retryable: false };
  }
  if (lower.includes("user not found") || lower.includes("course not found")) {
    return { code: "NOT_FOUND", message: msg, retryable: false };
  }

  return { code: "UNKNOWN", message: msg, retryable: true };
}

async function logAudit(db: ReturnType<typeof createClient>, action: string, entityId: string, status: string, details: Record<string, unknown>) {
  const payload = {
    actor_email: "moodle-sync@system",
    action,
    entity_type: "moodle_enrollment_sync",
    entity_id: entityId,
    status,
    details,
    logged_at: new Date().toISOString(),
  };

  for (const table of ["audit_logs", "audit_log"]) {
    const { error } = await db.from(table).insert(payload);
    if (!error) return;
  }
}

async function patchSyncRow(
  db: ReturnType<typeof createClient>,
  id: string,
  patch: Record<string, unknown>,
) {
  const nowIso = new Date().toISOString();
  const base = { ...patch, updated_at: nowIso };
  const variants = [
    { ...base, status: base.sync_status ?? base.status ?? null },
    {
      ...base,
      status: base.sync_status ?? base.status ?? null,
      attempts: base.sync_attempts,
      moodle_course_id: base.course_id,
      error_message: base.last_error,
    },
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
    const forceId = String(payload?.id || "").trim();
    const limit = Math.max(1, Math.min(25, Number(payload?.limit || 5) || 5));

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
      const registrationStatus = String(row.registration_status || "").toUpperCase();

      summary.processed += 1;

      if (!id) continue;

      if (registrationStatus !== "ASSIGNED") {
        await patchSyncRow(db, id, {
          sync_status: "SKIPPED",
          last_error: "Not ASSIGNED",
          error_message: "Not ASSIGNED",
        });
        summary.skipped += 1;
        continue;
      }

      if (!email) {
        await patchSyncRow(db, id, {
          sync_status: "FAILED",
          error_code: "INVALID_PAYLOAD",
          last_error: "Missing email",
          error_message: "Missing email",
          sync_attempts: Number(row.sync_attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
        });
        summary.failed += 1;
        summary.failures.push({ id, code: "INVALID_PAYLOAD", message: "Missing email" });
        await logAudit(db, "MOODLE_SYNC_FAILED", id, "FAILED", { reason: "Missing email" });
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
        });

        summary.synced += 1;
      } catch (error) {
        const c = classifyError(error);
        const retryCount = Number(row.retry_count || 0) + 1;
        const failureStatus: SyncStatus = c.retryable ? "RETRYING" : "FAILED";

        await patchSyncRow(db, id, {
          sync_status: failureStatus,
          error_code: c.code,
          last_error: c.message,
          error_message: c.message,
          retry_count: retryCount,
          retry_requested_at: c.retryable ? nowIso : null,
        });

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
                status: "FAILED",
                error_message: c.message,
                retry_count: retryCount,
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
                status: "FAILED",
                error_message: c.message,
                retry_count: retryCount,
                last_retry_at: nowIso,
                created_at: nowIso,
                updated_at: nowIso,
              });
          }
        } catch (_) {
          // failed_syncs is optional for visibility; keep enrollment sync state as source of truth.
        }

        await logAudit(db, "MOODLE_SYNC_FAILED", id, "FAILED", {
          code: c.code,
          message: c.message,
          retryable: c.retryable,
        });

        summary.failed += 1;
        summary.failures.push({ id, code: c.code, message: c.message });
      }
    }

    return json({ ok: true, ...summary });
  } catch (error) {
    const c = classifyError(error);
    return json({ ok: false, error: c.message, code: c.code }, 500);
  }
});
