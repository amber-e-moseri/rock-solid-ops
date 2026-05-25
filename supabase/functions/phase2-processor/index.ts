import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assignApplicant } from '../_shared/lib/assign-applicant.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const corsHeaders: Record<string, string> = {};

function applyAllowedOrigin(req: Request) {
  const allowed = String(Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const origin = String(req.headers.get('Origin') || '').trim()
  if (origin && allowed.includes(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
  } else {
    delete corsHeaders['Access-Control-Allow-Origin']
  }
}

interface WebhookPayload {
  action?: string
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  record: ApplicantRow
}

interface ApplicantRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  fellowship_code: string | null
  group_id: string | null
  class_option_id: string | null
  status: string
  submitted_at: string | null
}

Deno.serve(async (req: Request): Promise<Response> => {
  applyAllowedOrigin(req)
  const expectedSecret = String(Deno.env.get('PHASE2_WEBHOOK_SECRET') || '').trim()
  const providedSecret = String(req.headers.get('x-webhook-secret') || '').trim()

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return json({ ok: false, error: 'Unauthorized webhook caller' }, 401)
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  // CUTOVER ENFORCED: registration entry point disabled. See NEXT_STEPS.md
  const action = String(payload?.action || '').trim().toLowerCase()
  if (action === 'register' || action === 'process_registration') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Registration is handled by registration-processor. This path is disabled.', code: 'DISABLED' }),
      { status: 410, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (payload.type !== 'INSERT') {
    return json({ ok: true, skipped: true })
  }

  const applicant = payload.record
  const flowTraceId = crypto.randomUUID()

  try {
    const fellowshipCode = String(applicant.fellowship_code || "").trim().toUpperCase();
    if (!fellowshipCode) {
      await insertErrorSubmission(applicant.id, "Missing fellowship_code", { applicant_id: applicant.id, trace_id: flowTraceId });
      await logSync("PHASE2_NO_FELLOWSHIP_CODE", `Applicant ${applicant.id} has no fellowship_code`, { trace_id: flowTraceId });
      return json({ ok: true, handled: "error_submission" });
    }

    const { data: activeBatch } = await supabase
      .from("batches")
      .select("batch_id")
      .or("active.eq.true,registration_open.eq.true")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const activeBatchId = String(activeBatch?.batch_id || "").trim();
    if (!activeBatchId) {
      await insertErrorSubmission(applicant.id, "No active/open batch found", { applicant_id: applicant.id, trace_id: flowTraceId });
      await logSync("PHASE2_NO_ACTIVE_BATCH", `No active/open batch for applicant ${applicant.id}`, { trace_id: flowTraceId });
      return json({ ok: true, handled: "error_submission" });
    }

    const { data: classOptions, error: classErr } = await supabase
      .from("class_options")
      .select(`
        class_option_id,
        class_slots (
          class_slot_id,
          batch_id,
          current_enrolment,
          max_capacity,
          status
        )
      `)
      .contains("fellowship_codes", [fellowshipCode])
      .eq("active", true)
      .eq("enrollment_open", true)
      .is("deleted_at", null);
    if (classErr) throw classErr;

    const candidates: Array<{ class_option_id: string; current_enrolment: number }> = [];
    for (const co of classOptions || []) {
      for (const slot of co.class_slots || []) {
        if (slot.status !== "Active") continue;
        if (slot.batch_id !== activeBatchId) continue;
        if (slot.max_capacity !== null && Number(slot.current_enrolment || 0) >= Number(slot.max_capacity)) continue;
        candidates.push({
          class_option_id: String(co.class_option_id),
          current_enrolment: Number(slot.current_enrolment || 0),
        });
      }
    }
    candidates.sort((a, b) => a.current_enrolment - b.current_enrolment);
    const best = candidates[0];
    if (!best) {
      await insertErrorSubmission(applicant.id, `No open class for fellowship: ${fellowshipCode} in batch: ${activeBatchId}`, {
        applicant_id: applicant.id,
        fellowship_code: fellowshipCode,
        batch_id: activeBatchId,
        trace_id: flowTraceId,
      });
      await logSync("PHASE2_NO_CLASS_FOUND", `No open class for ${fellowshipCode} in batch ${activeBatchId}`, { trace_id: flowTraceId });
      return json({ ok: true, handled: "error_submission" });
    }

    const assigned = await assignApplicant(applicant.id, best.class_option_id, supabase, {
      batchId: activeBatchId,
      triggeredBy: "processor",
    })

    await logSync('PHASE2_SUCCESS', `Enrolled ${assigned.studentId || ''}`, {
      trace_id: flowTraceId,
      applicant_id: applicant.id,
      student_id: assigned.studentId,
      fellowship_code: fellowshipCode,
      class_option_id: assigned.classId,
      batch_id: assigned.batchId
    })

    return json({ ok: true, student_id: assigned.studentId || null })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logSync('PHASE2_ERROR', message, { applicant_id: applicant.id, trace_id: flowTraceId }).catch(() => {})
    return json({ ok: false, error: message })
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function insertErrorSubmission(
  sourceId: string,
  message: string,
  raw: Record<string, unknown>
): Promise<void> {
  await supabase.from('error_submissions').insert({
    source_form: 'phase2-processor',
    raw_data: { source_id: sourceId, ...raw },
    error_message: message,
    resolved: false
  })
}

async function logSync(
  phase: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const phaseText = String(phase || '').toUpperCase()
  const status = phaseText.includes('ERROR') || phaseText.includes('FAILED')
    ? 'FAILED'
    : phaseText.includes('SKIP')
      ? 'SKIPPED'
      : 'SUCCESS'
  await supabase.from('audit_logs').insert({
    action: phase || 'PHASE2_EVENT',
    entity_type: 'phase2_processor',
    entity_id: 'phase2-processor',
    status,
    details: {
      message,
      run_by: 'phase2-processor',
      ...(details ?? {})
    },
    logged_at: new Date().toISOString()
  })
}
