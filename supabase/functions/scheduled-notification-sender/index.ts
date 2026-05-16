/**
 * RETRY HELPER — NOT THE CANONICAL BATCH PROCESSOR
 *
 * Despite its name, scheduled-notification-sender does NOT process PENDING
 * scheduled_notifications in batch. It is a single-item retry helper used
 * exclusively by the Retry Center.
 *
 * What this function does:
 *   Accepts { id, source: "scheduled_notifications" }
 *   Resets that one notification to PENDING with scheduled_for = now()
 *   Returns immediately — no queuing, no Resend calls
 *
 * Canonical pipeline (as of May 2026):
 *   scheduled_notifications (PENDING, due)
 *   → reminder-processor     [canonical batch processor — inserts email_queue rows]
 *   → email_queue (Pending)
 *   → email-sender           [Resend delivery, cron daily 07:00 EST]
 *   → Resend
 *
 * This function is NOT scheduled. Do not add a cron to it.
 * Do not treat it as the scheduled_notifications batch sender.
 * For batch processing, see: supabase/functions/reminder-processor/index.ts
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const source = String(body.source || "").trim();

    console.log("RETRY_REQUEST", { id, source });

    if (!id) {
      return new Response(
        JSON.stringify({ ok: false, error: "id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (source !== "scheduled_notifications") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "source must equal scheduled_notifications",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: row, error: loadError } = await db
      .from("scheduled_notifications")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();

    if (loadError) throw loadError;

    if (!row) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "scheduled_notification not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const previousStatus = String(row.status || "");

    const { error: updateError } = await db
      .from("scheduled_notifications")
      .update({
        status: "PENDING",
        scheduled_for: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    console.log("RETRY_SUCCESS", {
      id,
      previous_status: previousStatus,
      new_status: "PENDING",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        id,
        previous_status: previousStatus,
        new_status: "PENDING",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("RETRY_FAILED", { error: message });

    return new Response(
      JSON.stringify({
        ok: false,
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
