import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

interface ClassCandidate {
  class_option_id: string
  teacher_id: string | null
  teacher_name: string | null
  class_slot_id: string
  batch_id: string
  current_enrolment: number
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

  if (payload.type !== 'INSERT') {
    return json({ ok: true, skipped: true })
  }

  const applicant = payload.record

  try {
    // Step 0: Look up the active/open batch — registration is locked to this batch
    const { data: activeBatch, error: batchErr } = await supabase
      .from('batches')
      .select('batch_id')
      .or('active.eq.true,registration_open.eq.true')
      .eq('archived', false)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (batchErr) throw batchErr

    if (!activeBatch) {
      await insertErrorSubmission(
        applicant.id,
        'No active or open batch found',
        { applicant_id: applicant.id, email: applicant.email }
      )
      await logSync('PHASE2_NO_ACTIVE_BATCH', `No active/open batch for applicant ${applicant.id}`)
      return json({ ok: true, handled: 'error_submission' })
    }

    const activeBatchId = activeBatch.batch_id

    // Step 1: Normalize fellowship_code
    const fellowshipCode = String(applicant.fellowship_code ?? '').trim().toUpperCase()
    if (!fellowshipCode) {
      await insertErrorSubmission(
        applicant.id,
        'Missing fellowship_code',
        { applicant_id: applicant.id, email: applicant.email }
      )
      await logSync('PHASE2_NO_FELLOWSHIP_CODE', `Applicant ${applicant.id} has no fellowship_code`)
      return json({ ok: true, handled: 'error_submission' })
    }

    // Step 2: Look up fellowship_map
    const { data: fellowship, error: fmErr } = await supabase
      .from('fellowship_map')
      .select('fellowship_code, campus_name, group_id, subgroup_id')
      .eq('fellowship_code', fellowshipCode)
      .eq('active', true)
      .single()

    if (fmErr || !fellowship) {
      await insertErrorSubmission(
        applicant.id,
        `Fellowship not found: ${fellowshipCode}`,
        { applicant_id: applicant.id, fellowship_code: fellowshipCode }
      )
      await logSync('PHASE2_FELLOWSHIP_NOT_FOUND', `No active fellowship: ${fellowshipCode}`)
      return json({ ok: true, handled: 'error_submission' })
    }

    const { group_id: groupId, subgroup_id: subgroupId } = fellowship

    // Step 3: Find best class_option
    type SlotRow = {
      class_slot_id: string
      batch_id: string
      current_enrolment: number
      max_capacity: number | null
      status: string
    }
    type ClassOptionRow = {
      class_option_id: string
      teacher_id: string | null
      teacher_name: string | null
      class_slots: SlotRow[]
    }

    const { data: classOptions, error: coErr } = await supabase
      .from('class_options')
      .select(`
        class_option_id,
        teacher_id,
        teacher_name,
        class_slots (
          class_slot_id,
          batch_id,
          current_enrolment,
          max_capacity,
          status
        )
      `)
      .contains('fellowship_codes', [fellowshipCode])
      .eq('active', true)
      .eq('enrollment_open', true)
      .is('deleted_at', null)

    if (coErr) throw coErr

    const candidates: ClassCandidate[] = []
    for (const co of (classOptions ?? []) as ClassOptionRow[]) {
      for (const slot of co.class_slots ?? []) {
        if (slot.status !== 'Active') continue
        // Only consider slots belonging to the active/open batch
        if (slot.batch_id !== activeBatchId) continue
        if (slot.max_capacity !== null && slot.current_enrolment >= slot.max_capacity) continue
        candidates.push({
          class_option_id: co.class_option_id,
          teacher_id: co.teacher_id,
          teacher_name: co.teacher_name,
          class_slot_id: slot.class_slot_id,
          batch_id: slot.batch_id,
          current_enrolment: slot.current_enrolment
        })
      }
    }

    candidates.sort((a, b) => a.current_enrolment - b.current_enrolment)
    const best = candidates[0]

    if (!best) {
      await insertErrorSubmission(
        applicant.id,
        `No open class for fellowship: ${fellowshipCode} in batch: ${activeBatchId}`,
        { applicant_id: applicant.id, fellowship_code: fellowshipCode, group_id: groupId, batch_id: activeBatchId }
      )
      await logSync('PHASE2_NO_CLASS_FOUND', `No open class for ${fellowshipCode} in batch ${activeBatchId}`)
      return json({ ok: true, handled: 'error_submission' })
    }

    // Step 4: Update applicant — lock to active batch
    const { error: updateApplicantErr } = await supabase
      .from('applicants')
      .update({
        group_id: groupId,
        class_option_id: best.class_option_id,
        batch_id: activeBatchId,
        status: 'Approved'
      })
      .eq('id', applicant.id)

    if (updateApplicantErr) throw updateApplicantErr

    // Step 5: Generate student_id
    const { count: existingCount, error: countErr } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .like('student_id', `FS-${groupId}-%`)

    if (countErr) throw countErr

    const seq = (existingCount ?? 0) + 1
    const studentId = `FS-${groupId}-${String(seq).padStart(5, '0')}`
    const fullName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ')

    // Step 6: Insert student
    const { error: studentErr } = await supabase
      .from('students')
      .insert({
        student_id: studentId,
        full_name: fullName,
        email: applicant.email,
        phone: applicant.phone ?? null,
        group_id: groupId,
        subgroup_id: subgroupId,
        fellowship_code: fellowshipCode,
        batch_id: best.batch_id,
        class_option_id: best.class_option_id,
        teacher_name: best.teacher_name ?? null,
        status: 'Active',
        eligible_for_fs: false
      })

    if (studentErr) throw studentErr

    // Step 7: Insert class_roster
    const { error: rosterErr } = await supabase
      .from('class_roster')
      .insert({
        student_id: studentId,
        class_option_id: best.class_option_id,
        batch_id: best.batch_id,
        group_id: groupId,
        subgroup_id: subgroupId,
        status: 'Active'
      })

    if (rosterErr) throw rosterErr

    // Step 8: Increment enrolment count
    await supabase
      .from('class_slots')
      .update({ current_enrolment: best.current_enrolment + 1 })
      .eq('class_slot_id', best.class_slot_id)

    // Step 9: Log success
    await logSync('PHASE2_SUCCESS', `Enrolled ${studentId}`, {
      applicant_id: applicant.id,
      student_id: studentId,
      fellowship_code: fellowshipCode,
      class_option_id: best.class_option_id,
      batch_id: activeBatchId
    })

    return json({ ok: true, student_id: studentId })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logSync('PHASE2_ERROR', message, { applicant_id: applicant.id }).catch(() => {})
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
  await supabase.from('sync_log').insert({
    phase,
    message,
    details: details ?? null,
    run_by: 'phase2-processor'
  })
}

