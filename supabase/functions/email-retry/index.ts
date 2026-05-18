import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";

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

type RetrySource = "scheduled_notifications" | "email_queue";

type RetryBody = {
  id?: string;
  source?: RetrySource;
};

function isAllowedStatus(status: string): boolean {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized === "FAILED" || normalized === "ERROR" ||
    normalized === "PENDING";
}

function hasMissingColumnError(error: unknown): boolean {
  const message = JSON.stringify(error || "");
  return message.includes(`"code":"42703"`) ||
    message.toLowerCase().includes("column");
}

async function retryScheduledNotification(
  db: any,
  id: string,
) {
  const { data: row, error: readError } = await db
    .from("scheduled_notifications")
    .select("id,status,attempts")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw readError;
  if (!row) throw new Error("Row not found in scheduled_notifications");

  const previousStatus = String(row.status || "");
  if (!isAllowedStatus(previousStatus)) {
    throw new Error(
      `Row status ${previousStatus || "(empty)"} is not retryable`,
    );
  }

  const baseUpdate = {
    status: "PENDING",
    attempts: Number(row.attempts || 0) + 1,
    updated_at: new Date().toISOString(),
    last_error: null as string | null,
  };

  let updateError: unknown = null;
  ({ error: updateError } = await db
    .from("scheduled_notifications")
    .update(baseUpdate)
    .eq("id", id));

  if (updateError && hasMissingColumnError(updateError)) {
    const fallbackUpdate = {
      status: "PENDING",
      attempts: Number(row.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db
      .from("scheduled_notifications")
      .update(fallbackUpdate)
      .eq("id", id);
    updateError = error;
  }

  if (updateError) throw updateError;

  return {
    previous_status: previousStatus,
    new_status: "PENDING",
  };
}

async function retryEmailQueue(
  db: any,
  id: string,
) {
  const { data: row, error: readError } = await db
    .from("email_queue")
    .select("id,status,attempts")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw readError;
  if (!row) throw new Error("Row not found in email_queue");

  const previousStatus = String(row.status || "");
  if (!isAllowedStatus(previousStatus)) {
    throw new Error(
      `Row status ${previousStatus || "(empty)"} is not retryable`,
    );
  }

  const attemptedCount = Number(row.attempts || 0) + 1;
  let updateError: unknown = null;

  // Try with optional columns first.
  ({ error: updateError } = await db
    .from("email_queue")
    .update({
      status: "pending",
      attempts: attemptedCount,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id));

  if (updateError && hasMissingColumnError(updateError)) {
    // Fallback: retry without optional columns.
    const fallbackPayload: Record<string, unknown> = {
      status: "pending",
      updated_at: new Date().toISOString(),
    };
    if (!JSON.stringify(updateError).includes("attempts")) {
      fallbackPayload.attempts = attemptedCount;
    }
    const { error } = await db
      .from("email_queue")
      .update(fallbackPayload)
      .eq("id", id);
    updateError = error;
  }

  if (updateError) throw updateError;

  return {
    previous_status: previousStatus,
    new_status: "pending",
  };
}

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const db = createServiceClient();
    const body = await req.json().catch(() => ({})) as RetryBody;

    const id = String(body.id || "").trim();
    const source = String(body.source || "").trim() as RetrySource;

    if (!id) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "id is required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (
      source !== "scheduled_notifications" &&
      source !== "email_queue"
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "source must be scheduled_notifications or email_queue",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const retryResult = source === "scheduled_notifications"
      ? await retryScheduledNotification(db, id)
      : await retryEmailQueue(db, id);

    await db
      .from("audit_logs")
      .insert({
        actor_email: "email-retry@system",
        action: "EMAIL_RETRY_REQUESTED",
        entity_type: source,
        entity_id: id,
        status: "SUCCESS",
        details: {
          previous_status: retryResult.previous_status,
          new_status: retryResult.new_status,
        },
      });

    return new Response(
      JSON.stringify({
        ok: true,
        source,
        id,
        previous_status: retryResult.previous_status,
        new_status: retryResult.new_status,
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

