import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RetryAction = "retry" | "resolve";
type RetrySource = "email_queue" | "scheduled_notifications" | "moodle_sync" | "moodle_enrollment_sync" | "failed_syncs";

type RetryRequest = {
  action?: RetryAction;
  source?: RetrySource;
  id?: string;
  limit?: number;
};

function applyAllowedOrigin(req: Request) {
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function triggerMoodleSync(
  supabaseUrl: string,
  serviceKey: string,
  id: string,
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/moodle-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, limit: 1 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`moodle-sync trigger failed (${res.status}): ${text}`);
  }
}

async function triggerClickupEscalation(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/clickup-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "escalation",
      payload,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error || `clickup-sync failed (${res.status})`));
  return data as Record<string, unknown>;
}

async function isAdmin(serviceDb: ReturnType<typeof createClient>, userId: string, email?: string) {
  try {
    const profile = await serviceDb
      .from("profiles")
      .select("role,is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile.error) return false;

    if (profile.data) {
      const role = String(profile.data?.role || "").toLowerCase();
      const active = profile.data?.is_active !== false;

      if (
        active &&
        ["admin", "superadmin", "subgroup_admin", "pastor", "principal"].includes(role)
      ) {
        return true;
      }
      return false;
    }

    const legacy = await serviceDb
      .from("admin_users")
      .select("role,status,active")
      .or(`auth_user_id.eq.${userId}${email ? `,email.eq.${email}` : ""}`)
      .maybeSingle();
    if (legacy.error) return false;

    const legacyRole = String(legacy.data?.role || "").toLowerCase();
    const active =
      legacy.data?.active !== false &&
      legacy.data?.status !== "suspended";

    if (
      active &&
      ["admin", "superadmin", "subgroup_admin", "pastor", "principal"].includes(legacyRole)
    ) {
      return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

async function logAudit(
  db: ReturnType<typeof createClient>,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  status: string,
  details: Record<string, unknown>,
) {
  const payload = {
    actor_email: actorEmail,
    action,
    entity_type: entityType,
    entity_id: entityId,
    status,
    details,
    created_at: new Date().toISOString(),
    logged_at: new Date().toISOString(),
  };

  await db.from("audit_logs").insert(payload);
}

function isRetryableMoodleError(errorCode: unknown) {
  const code = String(errorCode || "").trim().toUpperCase();
  if (!code) return true;
  const blocked = new Set([
    "MOODLE_AUTH_OR_WAF_BLOCKED",
    "COURSE_MAPPING_MISSING",
    "AUTH",
    "ALREADY_EXISTS",
    "NOT_FOUND",
  ]);
  return !blocked.has(code);
}

async function sweepMoodleEnrollmentRetries(
  db: ReturnType<typeof createClient>,
  limit = 25,
) {
  const { data, error } = await db
    .from("moodle_enrollment_sync")
    .select("id,error_code,sync_status,status,retry_requested_at,updated_at,retry_count,sync_attempts,clickup_task_id")
    .in("sync_status", ["RETRYING", "FAILED"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const candidates = (data || []).filter((row) => isRetryableMoodleError(row.error_code));
  let attempted = 0;
  for (const row of candidates) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    await applyRetry(db, "moodle_enrollment_sync", id);
    attempted += 1;
  }
  return { selected: (data || []).length, attempted, candidates };
}

async function maybeEscalateMoodleFailure(
  db: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  rowId: string,
) {
  const { data: row, error } = await db
    .from("moodle_enrollment_sync")
    .select("id,email,full_name,error_code,last_error,retry_count,sync_attempts,sync_status,status,student_id,registration_id,clickup_task_id,class_option_id")
    .eq("id", rowId)
    .maybeSingle();
  if (error || !row) return { escalated: false, reason: "row_not_found" };

  const attempts = Math.max(Number(row.retry_count || 0), Number(row.sync_attempts || 0));
  const status = String(row.sync_status || row.status || "").toUpperCase();
  const errorCode = String(row.error_code || "").toUpperCase();
  if (attempts < 3) return { escalated: false, reason: "below_threshold" };
  if (status === "RESOLVED" || status === "SYNCED" || status === "SKIPPED") return { escalated: false, reason: "already_resolved" };
  if (!isRetryableMoodleError(errorCode)) return { escalated: false, reason: "non_retryable" };

  let groupId = "";
  let subgroupId = "";
  if (row.class_option_id) {
    const { data: classOpt } = await db
      .from("class_options")
      .select("group_id,subgroup_id")
      .eq("class_option_id", row.class_option_id)
      .maybeSingle();
    groupId = String(classOpt?.group_id || "");
    subgroupId = String(classOpt?.subgroup_id || "");
  }

  const payload = {
    source: "moodle_enrollment_sync",
    source_id: String(row.id),
    student_id: String(row.student_id || ""),
    student_name: String(row.full_name || ""),
    email: String(row.email || ""),
    group_id: groupId,
    subgroup_id: subgroupId,
    reason: "Moodle enrollment sync failed repeatedly (>=3 attempts)",
    error_code: errorCode || "UNKNOWN",
    error_message: String(row.last_error || ""),
  };

  const clickupRes = await triggerClickupEscalation(supabaseUrl, serviceKey, payload);
  const taskId = String(clickupRes?.clickup_task_id || "").trim();
  if (taskId) {
    await db.from("moodle_enrollment_sync").update({ clickup_task_id: taskId }).eq("id", row.id);
  }
  return { escalated: true, clickup_task_id: taskId || null };
}

async function applyRetry(
  db: ReturnType<typeof createClient>,
  source: RetrySource,
  id: string,
) {
  const now = new Date().toISOString();

  if (source === "email_queue") {
    const { error } = await db
      .from("email_queue")
      .update({ status: "Pending", error_message: null, last_error: null, updated_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "scheduled_notifications") {
    const { error } = await db
      .from("scheduled_notifications")
      .update({ status: "PENDING", last_error: null, error_message: null, updated_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "moodle_sync") {
    const { error } = await db
      .from("moodle_sync")
      .update({ status: "PENDING", error_message: null, last_error: null, updated_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "moodle_enrollment_sync") {
    const { error } = await db
      .from("moodle_enrollment_sync")
      .update({
        sync_status: "RETRYING",
        status: "RETRYING",
        last_error: null,
        error_message: null,
        error_code: null,
        retry_requested_at: now,
        updated_at: now,
      })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "failed_syncs") {
    const { error } = await db
      .from("failed_syncs")
      .update({ status: "PENDING", error_message: null, last_retry_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }
}

async function applyResolve(
  db: ReturnType<typeof createClient>,
  source: RetrySource,
  id: string,
) {
  const now = new Date().toISOString();

  if (source === "email_queue") {
    const { error } = await db
      .from("email_queue")
      .update({ status: "Resolved", updated_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "scheduled_notifications") {
    const { error } = await db
      .from("scheduled_notifications")
      .update({ status: "RESOLVED", updated_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "moodle_sync") {
    const { error } = await db
      .from("moodle_sync")
      .update({ status: "RESOLVED", updated_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "moodle_enrollment_sync") {
    const { error } = await db
      .from("moodle_enrollment_sync")
      .update({
        sync_status: "RESOLVED",
        status: "RESOLVED",
        updated_at: now,
      })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (source === "failed_syncs") {
    const { error } = await db
      .from("failed_syncs")
      .update({ status: "RESOLVED", resolved_at: now })
      .eq("id", id);
    if (error) throw error;
    return;
  }
}

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "Missing Supabase env" }, 500);

    const serviceDb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const authHeader = req.headers.get("Authorization") || "";
    const isCronCall = !authHeader.startsWith("Bearer ");
    let actorEmail = "retry-worker@system";
    if (!isCronCall) {
      const jwt = authHeader.slice("Bearer ".length).trim();
      const { data: userData, error: userErr } = await serviceDb.auth.getUser(jwt);
      if (userErr || !userData?.user) return json({ ok: false, error: "Invalid session" }, 401);
      const allowed = await isAdmin(serviceDb, userData.user.id, userData.user.email);
      if (!allowed) return json({ ok: false, error: "Admin access required" }, 403);
      actorEmail = userData.user.email || actorEmail;
    }

    const body = (await req.json().catch(() => ({}))) as RetryRequest;
    const action = String(body.action || "").toLowerCase() as RetryAction;
    const source = String(body.source || "") as RetrySource;
    const id = String(body.id || "").trim();
    const limit = Number.isFinite(Number(body.limit)) ? Math.max(1, Math.min(100, Number(body.limit))) : 25;

    if (isCronCall && !id) {
      const sweep = await sweepMoodleEnrollmentRetries(serviceDb, limit);
      let escalated = 0;
      for (const row of sweep.candidates || []) {
        try {
          const outcome = await maybeEscalateMoodleFailure(serviceDb, SUPABASE_URL, SERVICE_KEY, String(row.id || ""));
          if (outcome.escalated) escalated += 1;
        } catch (err) {
          console.error("RETRY_SWEEP_ESCALATION_ERROR", err);
        }
      }
      await logAudit(
        serviceDb,
        actorEmail,
        "RETRY_SWEEP_EXECUTED",
        "moodle_enrollment_sync",
        "batch",
        "SUCCESS",
        { source: "moodle_enrollment_sync", selected: sweep.selected, attempted: sweep.attempted, escalated, limit },
      );
      // Trigger Moodle sync once after sweep to process newly marked RETRYING rows.
      if (sweep.attempted > 0) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/moodle-sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SERVICE_KEY}`,
              apikey: SERVICE_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ limit: limit }),
          });
        } catch (triggerErr) {
          console.error("RETRY_SWEEP_MOODLE_TRIGGER_ERROR", triggerErr);
        }
      }
      return json({ ok: true, mode: "auto_sweep", source: "moodle_enrollment_sync", selected: sweep.selected, attempted: sweep.attempted, escalated, limit });
    }

    if (!id) return json({ ok: false, error: "id is required" }, 400);
    if (!["retry", "resolve"].includes(action)) return json({ ok: false, error: "action must be retry|resolve" }, 400);
    if (!["email_queue", "scheduled_notifications", "moodle_sync", "moodle_enrollment_sync", "failed_syncs"].includes(source)) {
      return json({ ok: false, error: "Unsupported source" }, 400);
    }

    if (action === "retry") {
      if (source === "moodle_enrollment_sync") {
        const { data: row } = await serviceDb
          .from("moodle_enrollment_sync")
          .select("error_code")
          .eq("id", id)
          .maybeSingle();
        if (!isRetryableMoodleError(row?.error_code)) {
          return json({ ok: false, error: `Non-retryable error_code: ${String(row?.error_code || "UNKNOWN")}` }, 409);
        }
      }

      await applyRetry(serviceDb, source, id);

      if (source === "moodle_enrollment_sync") {
        try {
          await maybeEscalateMoodleFailure(serviceDb, SUPABASE_URL, SERVICE_KEY, id);
        } catch (escalationErr) {
          console.error("RETRY_WORKER_CLICKUP_ESCALATION_ERROR", escalationErr);
        }
        try {
          await triggerMoodleSync(SUPABASE_URL, SERVICE_KEY, id);
        } catch (triggerErr) {
          console.error("RETRY_WORKER_MOODLE_TRIGGER_ERROR", triggerErr);
        }
      }
    }
    else await applyResolve(serviceDb, source, id);

    await logAudit(
      serviceDb,
      actorEmail,
      action === "retry"
        ? (source === "moodle_enrollment_sync" ? "MOODLE_SYNC_RETRIED" : "RETRY_REQUESTED")
        : "RETRY_MARK_RESOLVED",
      source,
      id,
      "SUCCESS",
      { action, source, id },
    );

    return json({ ok: true, action, source, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});

