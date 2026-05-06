import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TRACKED_TEMPLATES = new Set([
  "foundation_welcome",
  "waitlist_confirmation",
  "registration_under_review",
  "duplicate_registration",
  "no_suitable_times",
  "no_class_available",
  "class_assigned",
]);

const UNSUPPORTED_TEMPLATES = new Set([
  "class_reminder_7_day",
  "class_reminder_1_day",
  "class_reminder_2_hour",
]);

Deno.serve(async (req) => {
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

  const startedAt = Date.now();
  console.log("WORKER_START", { at: new Date(startedAt).toISOString() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const db = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 5), 1), 50);
    const nowIso = new Date().toISOString();

    const { data: pendingData, error: pendingError } = await db
      .from("scheduled_notifications")
      .select("id,recipient_email,template_key,attempts,max_attempts,scheduled_for")
      .eq("status", "PENDING")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (pendingError) throw pendingError;

    const rows = (pendingData || []).filter((r) =>
      Number(r.attempts || 0) < Number(r.max_attempts || 3)
    );

    console.log("LOADED_PENDING", {
      requested_limit: limit,
      loaded: rows.length,
    });

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];

    for (const row of rows) {
      processed += 1;
      const attempts = Number(row.attempts || 0);
      const nextAttempts = attempts + 1;
      const email = String(row.recipient_email || "").trim().toLowerCase();
      const templateKey = String(row.template_key || "").trim();

      try {
        if (TRACKED_TEMPLATES.has(templateKey)) {
          console.log("TRACKING_EMAIL_QUEUE", {
            scheduled_notification_id: row.id,
            recipient_email: email,
            template_key: templateKey,
          });

          const { data: queueRow, error: queueError } = await db
            .from("email_queue")
            .select("id,status,created_at")
            .eq("recipient_email", email)
            .eq("template_key", templateKey)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (queueError) throw queueError;

          if (queueRow) {
            const { error: updateError } = await db
              .from("scheduled_notifications")
              .update({
                status: "SENT",
                attempts: nextAttempts,
                sent_at: new Date().toISOString(),
                last_error: null,
                provider_message_id: String(queueRow.id || ""),
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);

            if (updateError) throw updateError;

            console.log("EMAIL_QUEUE_MATCHED", {
              scheduled_notification_id: row.id,
              email_queue_id: queueRow.id,
            });
            sent += 1;
          } else {
            const errorMessage =
              "No matching email_queue row found for already-handled template.";

            const { error: updateError } = await db
              .from("scheduled_notifications")
              .update({
                status: "FAILED",
                attempts: nextAttempts,
                last_error: errorMessage,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);

            if (updateError) throw updateError;

            console.log("EMAIL_QUEUE_MISSING", {
              scheduled_notification_id: row.id,
              recipient_email: email,
              template_key: templateKey,
            });
            failed += 1;
            failures.push({ id: row.id, error: errorMessage });
          }

          continue;
        }

        if (UNSUPPORTED_TEMPLATES.has(templateKey)) {
          const skipMessage = "Template is not yet wired to a delivery flow.";

          const { error: updateError } = await db
            .from("scheduled_notifications")
            .update({
              status: "SKIPPED_UNSUPPORTED",
              attempts: nextAttempts,
              last_error: skipMessage,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          if (updateError) throw updateError;

          console.log("SKIPPED_UNSUPPORTED", {
            scheduled_notification_id: row.id,
            template_key: templateKey,
          });
          skipped += 1;
          continue;
        }

        const unknownTemplateMessage =
          "Template is not classified by sender-worker policy.";

        const { error: updateError } = await db
          .from("scheduled_notifications")
          .update({
            status: "SKIPPED_UNSUPPORTED",
            attempts: nextAttempts,
            last_error: unknownTemplateMessage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateError) throw updateError;

        console.log("SKIPPED_UNSUPPORTED", {
          scheduled_notification_id: row.id,
          template_key: templateKey,
          reason: "unclassified_template",
        });
        skipped += 1;
      } catch (rowErr) {
        const message = rowErr instanceof Error ? rowErr.message : String(rowErr);

        failed += 1;
        failures.push({ id: row.id, error: message });

        // Best-effort fail marking for unexpected row-level errors.
        await db
          .from("scheduled_notifications")
          .update({
            status: "FAILED",
            attempts: nextAttempts,
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log("WORKER_DONE", {
      ok: true,
      processed,
      sent,
      failed,
      skipped,
      duration_ms: durationMs,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        sent,
        failed,
        skipped,
        failures,
        duration_ms: durationMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    console.log("WORKER_DONE", {
      ok: false,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      duration_ms: durationMs,
      error: message,
    });

    return new Response(
      JSON.stringify({
        ok: false,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        failures: [{ id: "batch", error: message }],
        duration_ms: durationMs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
