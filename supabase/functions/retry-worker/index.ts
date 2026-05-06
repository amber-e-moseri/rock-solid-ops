import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RetryAction = "retry" | "resolve";
type RetrySource = "email_queue" | "scheduled_notifications" | "moodle_sync" | "failed_syncs";

type RetryRequest = {
  action?: RetryAction;
  source?: RetrySource;
  id?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function isAdmin(serviceDb: ReturnType<typeof createClient>, userId: string) {
  const profile = await serviceDb
    .from("profiles")
    .select("role,is_active")
    .eq("user_id", userId)
    .maybeSingle();

  const role = String(profile.data?.role || "").toLowerCase();
  const active = profile.data?.is_active !== false;
  if (active && ["admin", "superadmin", "subgroup_admin", "pastor", "principal"].includes(role)) {
    return true;
  }

  const legacy = await serviceDb
    .from("admin_users")
    .select("role")
    .eq("auth_user_id", userId)
    .maybeSingle();

  const legacyRole = String(legacy.data?.role || "").toLowerCase();
  return ["admin", "superadmin", "subgroup_admin", "pastor", "principal"].includes(legacyRole);
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

  const tables = ["audit_logs", "audit_log"];
  for (const t of tables) {
    const { error } = await db.from(t).insert(payload);
    if (!error) return;
    const msg = String(error.message || "").toLowerCase();
    if (!msg.includes("does not exist") && error.code !== "42P01") return;
  }
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "Missing Supabase env" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Missing bearer token" }, 401);
    const jwt = authHeader.slice("Bearer ".length).trim();

    const serviceDb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await serviceDb.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ ok: false, error: "Invalid session" }, 401);
    const allowed = await isAdmin(serviceDb, userData.user.id);
    if (!allowed) return json({ ok: false, error: "Admin access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as RetryRequest;
    const action = String(body.action || "").toLowerCase() as RetryAction;
    const source = String(body.source || "") as RetrySource;
    const id = String(body.id || "").trim();

    if (!id) return json({ ok: false, error: "id is required" }, 400);
    if (!["retry", "resolve"].includes(action)) return json({ ok: false, error: "action must be retry|resolve" }, 400);
    if (!["email_queue", "scheduled_notifications", "moodle_sync", "failed_syncs"].includes(source)) {
      return json({ ok: false, error: "Unsupported source" }, 400);
    }

    if (action === "retry") await applyRetry(serviceDb, source, id);
    else await applyResolve(serviceDb, source, id);

    await logAudit(
      serviceDb,
      userData.user.email || "admin@system",
      action === "retry" ? "RETRY_REQUESTED" : "RETRY_MARK_RESOLVED",
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
