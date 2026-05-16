import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ApiError } from "./_lib/errors.ts";
import { actionMap } from "./_lib/action-map.ts";
import { applyAllowedOrigin, corsHeaders, json, withTimeout } from "./_lib/http.ts";
import { resolveAuthContext } from "./_lib/teacher-auth.ts";

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed", code: "INVALID_PAYLOAD" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: any = {};
    try {
      const text = await withTimeout(req.text(), "request body read");
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ ok: false, error: "Invalid request body", code: "INVALID_PAYLOAD" }, 400);
    }

    const action = String(body.action || "").trim();
    const params = body.params || {};
    if (!action) throw new ApiError("INVALID_PAYLOAD", "action is required", 400);

    const handler = actionMap[action];
    if (!handler) throw new ApiError("INVALID_PAYLOAD", `Unsupported action: ${action}`, 400);

    let auth;
    try {
      auth = await resolveAuthContext(req, db);
    } catch (err) {
      if (
        action === "getTeacherAvailabilityHistory" &&
        err instanceof ApiError &&
        err.code === "INVALID_TEACHER_MAPPING"
      ) {
        return json({ ok: true, data: [] });
      }
      throw err;
    }

    return await handler({ db, auth, params });
  } catch (err) {
    if (err instanceof ApiError) {
      return json({ ok: false, error: err.message, code: err.code }, err.status);
    }

    return json({ ok: false, error: "Request failed", code: "INTERNAL_ERROR" }, 500);
  }
});
