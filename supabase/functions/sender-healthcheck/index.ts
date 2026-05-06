import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async () => {
  return new Response(JSON.stringify({
    ok: true,
    message: "sender-healthcheck reached",
    timestamp: new Date().toISOString()
  }), {
    headers: { "Content-Type": "application/json" }
  });
});
