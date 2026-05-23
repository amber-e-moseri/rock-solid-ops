/**
 * TOMBSTONE — notification-retry-helper has been merged into retry-worker (May 2026).
 *
 * This function is no longer active. All retry logic for scheduled_notifications
 * (including scheduled_for reset) is now handled by retry-worker.
 *
 * Update your caller:
 *   POST /functions/v1/retry-worker
 *   Body: { action: "retry", source: "scheduled_notifications", id: "<row-id>" }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      ok: false,
      gone: true,
      error:
        "notification-retry-helper has been merged into retry-worker. POST to /functions/v1/retry-worker with { action: 'retry', source: 'scheduled_notifications', id: '<row-id>' }.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
