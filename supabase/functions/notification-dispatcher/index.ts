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

type NotificationEventRow = {
  id: string;
  event_type: string;
  applicant_id: string | null;
  email: string | null;
  fellowship_code: string | null;
  class_option_id: string | null;
  batch_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string | null;
  created_at: string | null;
};

type NotificationRuleRow = {
  id: string;
  event_type: string;
  template_key: string;
  priority: number | null;
  active: boolean;
};

const STATE_BY_EVENT: Record<string, string | "KEEP"> = {
  REGISTRATION_RECEIVED: "PENDING_SELECTION",
  NO_CLASS_AVAILABLE: "WAITING_FOR_CLASSES",
  NO_MATCHING_TIME: "WAITING_FOR_MORE_TIMES",
  CLASS_ASSIGNED: "CLASS_ASSIGNED",
  CLASS_REMINDER_7_DAY: "KEEP",
  CLASS_REMINDER_1_DAY: "KEEP",
  CLASS_REMINDER_2_HOUR: "KEEP",
  DUPLICATE_REGISTRATION: "KEEP",
};

function resolveNextState(
  eventType: string,
  currentState: string | null,
): string {
  const mapped = STATE_BY_EVENT[eventType] ?? "KEEP";
  if (mapped === "KEEP") return currentState || "PENDING_SELECTION";
  return mapped;
}

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 20), 1), 200);

    const {
      data: events,
      error: eventsError,
    } = await db
      .from("notification_events")
      .select(
        "id,event_type,applicant_id,email,fellowship_code,class_option_id,batch_id,payload,occurred_at,created_at",
      )
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (eventsError) throw eventsError;

    const typedEvents = (events || []) as NotificationEventRow[];

    let processedEvents = 0;
    let scheduledCreated = 0;
    let skippedDuplicates = 0;
    const failures: Array<{ event_id: string; error: string }> = [];

    for (const event of typedEvents) {
      try {
        processedEvents += 1;

        const recipientEmail = String(event.email || "").trim().toLowerCase();
        if (!recipientEmail) {
          failures.push({
            event_id: event.id,
            error: "Missing event.email",
          });
          continue;
        }

        const {
          data: rules,
          error: rulesError,
        } = await db
          .from("notification_rules")
          .select("id,event_type,template_key,priority,active")
          .eq("active", true)
          .eq("event_type", event.event_type)
          .order("priority", { ascending: true });

        if (rulesError) throw rulesError;
        const typedRules = (rules || []) as NotificationRuleRow[];

        for (const rule of typedRules) {
          const dedupeKey = `${event.id}:${rule.id}:${rule.template_key}`;
          const traceId = String((event.payload as Record<string, unknown> | null)?.trace_id || "").trim() || crypto.randomUUID();
          const payload = {
            ...(event.payload || {}),
            trace_id: traceId,
            event_type: event.event_type,
            template_key: rule.template_key,
            fellowship_code: event.fellowship_code,
            class_option_id: event.class_option_id,
            batch_id: event.batch_id,
          };

          const { error: insertError } = await db
            .from("scheduled_notifications")
            .insert({
              event_id: event.id,
              applicant_id: event.applicant_id,
              recipient_email: recipientEmail,
              event_type: event.event_type,
              template_key: rule.template_key,
              scheduled_for: new Date().toISOString(),
              status: "PENDING",
              attempts: 0,
              payload,
              trace_id: traceId,
              dedupe_key: dedupeKey,
            });

          if (insertError) {
            const raw = JSON.stringify(insertError);
            const isDuplicate =
              raw.includes("duplicate key") ||
              raw.includes("scheduled_notifications_dedupe_key_uq") ||
              raw.includes("23505");
            if (isDuplicate) {
              skippedDuplicates += 1;
              continue;
            }
            throw insertError;
          }

          scheduledCreated += 1;

          await db.from("audit_logs").insert({
            actor_email: "notification-dispatcher@system",
            action: "NOTIFICATION_DISPATCHED",
            entity_type: "notification_event",
            entity_id: event.id,
            status: "SUCCESS",
            details: {
              event_type: event.event_type,
              template_key: rule.template_key,
              recipient_email: recipientEmail,
              dedupe_key: dedupeKey,
              trace_id: traceId,
            },
          });
        }

        if (event.applicant_id) {
          const { data: existingStateRow } = await db
            .from("applicant_notification_state")
            .select("notification_state,counters,meta")
            .eq("applicant_id", event.applicant_id)
            .maybeSingle();

          const currentState =
            String(existingStateRow?.notification_state || "").trim() || null;

          const nextState = resolveNextState(event.event_type, currentState);
          const nextMeta = {
            ...(existingStateRow?.meta || {}),
            ...(event.event_type === "DUPLICATE_REGISTRATION"
              ? { duplicate_registration: true }
              : {}),
          };

          await db
            .from("applicant_notification_state")
            .upsert({
              applicant_id: event.applicant_id,
              notification_state: nextState,
              last_event_at: event.occurred_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
              counters: existingStateRow?.counters || {},
              meta: nextMeta,
            }, { onConflict: "applicant_id" });
        }
      } catch (eventErr) {
        console.error("NOTIFICATION_DISPATCHER_EVENT_ERROR", {
          event_id: event.id,
          error: eventErr,
        });
        failures.push({
          event_id: event.id,
          error: eventErr instanceof Error ? eventErr.message : String(eventErr),
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed_events: processedEvents,
        scheduled_created: scheduledCreated,
        skipped_duplicates: skippedDuplicates,
        failures,
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
