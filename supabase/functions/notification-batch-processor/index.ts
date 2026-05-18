import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withTrace, writeAudit } from "../_shared/audit.ts";

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

type ScheduledNotificationRow = {
  id: string;
  recipient_email: string;
  template_key: string;
  payload: Record<string, unknown> | null;
  status: string;
  attempts: number;
  max_attempts: number;
  scheduled_for: string;
  trace_id: string | null;
};

function buildSubjectFromTemplate(templateKey: string): string {
  const map: Record<string, string> = {
    foundation_welcome: "Welcome to Foundation School",
    duplicate_registration: "We received your additional registration",
    no_class_available: "Class options are not available yet",
    no_suitable_times: "We'll notify you when more class times open",
    class_assigned: "Your class has been assigned",
    class_approved: "New class options are now available",
    class_reminder_7_day: "Reminder: your class starts in 7 days",
    class_reminder_1_day: "Reminder: your class starts tomorrow",
    class_reminder_2_hour: "Reminder: your class starts in 2 hours",
  };
  return map[templateKey] || "Foundation School Notification";
}

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 200);

    const nowIso = new Date().toISOString();
    let data: ScheduledNotificationRow[] | null = null;
    let error: { message?: string } | null = null;
    ({
      data,
      error,
    } = await db
      .from("scheduled_notifications")
      .select(
        "id,recipient_email,template_key,payload,status,attempts,max_attempts,scheduled_for,trace_id",
      )
      .eq("status", "PENDING")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(limit));

    if (error) {
      const msg = JSON.stringify(error);
      if (msg.includes("trace_id")) {
        const legacyRes = await db
          .from("scheduled_notifications")
          .select(
            "id,recipient_email,template_key,payload,status,attempts,max_attempts,scheduled_for",
          )
          .eq("status", "PENDING")
          .lte("scheduled_for", nowIso)
          .order("scheduled_for", { ascending: true })
          .limit(limit);
        if (legacyRes.error) throw legacyRes.error;
        data = ((legacyRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
          ...(row as ScheduledNotificationRow),
          trace_id: null,
        }));
      } else {
        throw error;
      }
    }
    const rows = (data || []) as ScheduledNotificationRow[];

    let processed = 0;
    let queued = 0;
    let failed = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      processed += 1;

      try {
        if ((row.attempts || 0) >= (row.max_attempts || 0)) {
          failed += 1;
          results.push({
            id: row.id,
            status: "skipped_max_attempts",
          });
          continue;
        }

        const nextAttempts = (row.attempts || 0) + 1;
        const subject = buildSubjectFromTemplate(String(row.template_key || ""));

        const emailQueueInsert = {
          recipient_email: row.recipient_email,
          recipient_name: String((row.payload || {}).full_name || ""),
          template_key: row.template_key,
          subject,
          status: "Pending",
          payload: row.payload || {},
          trace_id: row.trace_id || null,
        };
        let queueErr: { message?: string } | null = null;
        ({ error: queueErr } = await db
          .from("email_queue")
          .insert(emailQueueInsert));
        if (queueErr) {
          const queueMsg = JSON.stringify(queueErr);
          if (queueMsg.includes("trace_id")) {
            const legacyInsert = { ...emailQueueInsert };
            delete (legacyInsert as Record<string, unknown>).trace_id;
            ({ error: queueErr } = await db
              .from("email_queue")
              .insert(legacyInsert));
          }
        }

        if (queueErr) throw queueErr;

        const { error: sentErr } = await db
          .from("scheduled_notifications")
          .update({
            status: "SENT",
            sent_at: new Date().toISOString(),
            attempts: nextAttempts,
            error_message: null,
          })
          .eq("id", row.id);

        if (sentErr) throw sentErr;

        await writeAudit(
          db,
          "SCHEDULED_NOTIFICATION_QUEUED",
          row.id,
          withTrace(
            {
              recipient_email: row.recipient_email,
              template_key: row.template_key,
            },
            row.trace_id || null,
          ),
          {
            actor_email: "notification-batch-processor@system",
            entity_type: "scheduled_notification",
            status: "SUCCESS",
          },
        );

        queued += 1;
        results.push({
          id: row.id,
          status: "queued",
          recipient_email: row.recipient_email,
          template_key: row.template_key,
        });
      } catch (rowErr) {
        const message = rowErr instanceof Error ? rowErr.message : String(rowErr);
        const nextAttempts = (row.attempts || 0) + 1;
        const nextStatus = nextAttempts >= (row.max_attempts || 0)
          ? "FAILED"
          : "PENDING";

        await db
          .from("scheduled_notifications")
          .update({
            attempts: nextAttempts,
            status: nextStatus,
            error_message: message,
          })
          .eq("id", row.id);

        failed += 1;
        results.push({
          id: row.id,
          status: "failed",
          error: message,
          attempts: nextAttempts,
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        queued,
        failed,
        results,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});

