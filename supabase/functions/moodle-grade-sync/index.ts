/**
 * moodle-grade-sync — Edge Function
 *
 * PREREQUISITE (manual Moodle admin step — do this before deploying):
 *   Site admin → Server → Web services → External services → [your service] → Add functions:
 *     - core_completion_get_course_completion_status
 *   Then enable completion tracking:
 *     Site admin → Advanced features → Enable completion tracking = ON
 *
 * Checks Moodle course completion for all SYNCED enrollments and upserts
 * student_milestone_status (milestone_code = 'HOLY_SPIRIT') when a course is completed.
 * Processes in batches of 20 to avoid timeouts.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, safeLogAudit } from "../_shared/http.ts";

const MOODLE_URL              = Deno.env.get("MOODLE_URL") || "";
const MOODLE_TOKEN            = Deno.env.get("MOODLE_TOKEN") || "";
const SUPABASE_URL            = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BATCH_SIZE              = 20;
const CALL_TIMEOUT_MS         = 15_000;

// Minimal callMoodle — POST to /webservice/rest/server.php with wstoken + wsfunction + json format.
async function callMoodle(
  wsfunction: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    wstoken: MOODLE_TOKEN,
    wsfunction,
    moodlewsrestformat: "json",
    ...params,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${MOODLE_URL}/webservice/rest/server.php`, {
      method: "POST",
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Moodle HTTP ${res.status}`);
    const json = await res.json();
    if (json?.exception) throw new Error(`Moodle error: ${json.message || json.exception}`);
    return json as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!MOODLE_URL || !MOODLE_TOKEN) {
    return jsonResponse({ ok: false, error: "MOODLE_URL and MOODLE_TOKEN must be configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch all SYNCED rows that have a Moodle user and course assigned.
  const { data: rows, error: fetchErr } = await supabase
    .from("moodle_enrollment_sync")
    .select("id,email,moodle_user_id,course_id,batch_id,class_option_id")
    .eq("sync_status", "SYNCED")
    .not("moodle_user_id", "is", null)
    .not("course_id", "is", null)
    .limit(200);

  if (fetchErr) return jsonResponse({ ok: false, error: fetchErr.message }, 500);

  const synced   = rows || [];
  let checked    = 0;
  let newly_completed = 0;
  const errors: string[] = [];

  for (let i = 0; i < synced.length; i += BATCH_SIZE) {
    const batch = synced.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (row) => {
        checked++;
        try {
          const result = await callMoodle("core_completion_get_course_completion_status", {
            userid:   String(row.moodle_user_id),
            courseid: String(row.course_id),
          });

          const completed =
            (result as { completionstatus?: { completed?: boolean } })
              ?.completionstatus?.completed === true;

          if (!completed) return;

          // Resolve applicant by email + batch.
          const { data: applicant } = await supabase
            .from("applicants")
            .select("id,full_name,email")
            .eq("email", row.email)
            .eq("batch_id", row.batch_id)
            .limit(1)
            .maybeSingle();

          if (!applicant) return;

          // Skip if milestone already recorded.
          const { data: existing } = await supabase
            .from("student_milestone_status")
            .select("completed")
            .eq("applicant_id", applicant.id)
            .eq("milestone_code", "HOLY_SPIRIT")
            .maybeSingle();

          if (existing?.completed) return;

          const { error: upsertErr } = await supabase
            .from("student_milestone_status")
            .upsert(
              {
                applicant_id:   applicant.id,
                milestone_code: "HOLY_SPIRIT",
                completed:      true,
                updated_at:     new Date().toISOString(),
              },
              { onConflict: "applicant_id,milestone_code" },
            );

          if (upsertErr) throw upsertErr;

          newly_completed++;

          // Non-fatal in-app notification for admins.
          supabase.from("in_app_notifications").insert({
            recipient_role: "admin",
            title:          "Course completed",
            body:           `${applicant.full_name || applicant.email} completed the Moodle course`,
            type:           "success",
          }).catch(() => {});
        } catch (err) {
          errors.push(`${row.email}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  }

  await safeLogAudit(supabase, {
    action:      "MOODLE_GRADE_SYNC",
    entity_type: "system",
    status:      "SUCCESS",
    details:     { checked, newly_completed, errors_count: errors.length },
  });

  return jsonResponse({ ok: true, checked, newly_completed, errors });
});

