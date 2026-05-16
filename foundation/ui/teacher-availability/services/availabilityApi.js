/**
 * availabilityApi.js
 * Supabase-backed API service for the Teacher Availability scheduler.
 *
 * Supabase-native API wrapper for scheduler operations.
 * All exported function names are preserved so component files require no changes.
 *
 * Env vars required (via Vite):
 *   VITE_SUPABASE_URL       â€” Supabase project URL
 *   VITE_SUPABASE_ANON_KEY  â€” Supabase anon/public key (RLS enforced)
 */

import { createClient } from '@supabase/supabase-js'

// â”€â”€ Named client instance (importable by components that need direct access) â”€â”€

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// â”€â”€ Internal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function assertData(data, error, label) {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Returns all active fellowships for the campus selector dropdown.
 * Replaces: GET ?action=getCampuses
 * @returns {Promise<Array<{code, name, group, subgroup, timezone}>>}
 */
export async function getCampuses() {
  const { data, error } = await supabase
    .from('fellowship_map')
    .select('fellowship_code, campus_name, group_id, subgroup_id, timezone')
    .eq('active', true)
    .order('campus_name')

  assertData(data, error, 'getCampuses')

  return (data ?? []).map(r => ({
    code:      r.fellowship_code,
    name:      r.campus_name,
    group:     r.group_id,
    subgroup:  r.subgroup_id,
    timezone:  r.timezone ?? 'America/Toronto'
  }))
}

/**
 * Returns active, non-deleted teachers.
 * Replaces: GET ?action=getTeachers
 * @param {{ groupId?: string, subgroupId?: string }} [params]
 * @returns {Promise<Array<{teacherID, teacherName, teacherEmail}>>}
 */
export async function getTeachers(params = {}) {
  let query = supabase
    .from('teachers')
    .select('teacher_id, full_name, email, group_id, subgroup_id')
    .eq('active', true)
    .is('deleted_at', null)
    .order('full_name')

  if (params.groupId)    query = query.eq('group_id', params.groupId)
  if (params.subgroupId) query = query.eq('subgroup_id', params.subgroupId)

  const { data, error } = await query
  assertData(data, error, 'getTeachers')

  return (data ?? []).map(r => ({
    teacherID:       r.teacher_id,
    teacherName:     r.full_name,
    teacherEmail:    r.email ?? '',
    groupId:         r.group_id,
    subgroupId:      r.subgroup_id
  }))
}

/**
 * Loads a teacher's availability records, optionally filtered by batch.
 * Replaces: GET ?action=loadAvailability
 * @param {{ teacherEmail: string, batchId?: string }} params
 * @returns {Promise<Array>}
 */
export async function loadAvailability({ teacherEmail, batchId } = {}) {
  if (!teacherEmail) throw new Error('teacherEmail is required')

  // Resolve teacher_id from email first.
  const { data: teacher, error: tErr } = await supabase
    .from('teachers')
    .select('teacher_id, full_name')
    .eq('email', teacherEmail)
    .eq('active', true)
    .is('deleted_at', null)
    .single()

  if (tErr || !teacher) return []

  let query = supabase
    .from('teacher_availability')
    .select(`
      id,
      teacher_id,
      class_option_id,
      batch_id,
      day,
      time_slot,
      status,
      notes,
      updated_at
    `)
    .eq('teacher_id', teacher.teacher_id)
    .order('day')
    .order('time_slot')

  if (batchId) query = query.eq('batch_id', batchId)

  const { data, error } = await query
  assertData(data, error, 'loadAvailability')

  return data ?? []
}

/**
 * Upserts a set of availability records for a teacher.
 * Used for programmatic saves (e.g. auto-save drafts).
 * Replaces: POST ?action=submitAvailability (partial / draft path)
 * @param {Array<{ teacher_id, batch_id, day, time_slot, status, notes? }>} payload
 * @returns {Promise<{ upserted: number }>}
 */
export async function saveAvailability(payload) {
  if (!Array.isArray(payload) || !payload.length) {
    throw new Error('saveAvailability: payload must be a non-empty array')
  }

  const { data, error } = await supabase
    .from('teacher_availability')
    .upsert(payload, { onConflict: 'teacher_id,batch_id,day,time_slot', ignoreDuplicates: false })
    .select('id')

  assertData(data, error, 'saveAvailability')
  return { upserted: (data ?? []).length }
}

/**
 * Returns all active class options available to a specific campus.
 * Replaces: GET ?action=getCampusSchedule
 * @param {{ fellowshipCode: string, batchId?: string }} params
 * @returns {Promise<Array>}
 */
export async function getCampusSchedule({ fellowshipCode, batchId } = {}) {
  if (!fellowshipCode) throw new Error('fellowshipCode is required')

  let query = supabase
    .from('class_options')
    .select(`
      class_option_id,
      class_id,
      teacher_id,
      teacher_name,
      day,
      class_time,
      group_id,
      subgroup_id,
      active,
      enrollment_open,
      max_capacity,
      class_slots (
        class_slot_id,
        batch_id,
        current_enrolment,
        status
      )
    `)
    .contains('fellowship_codes', [fellowshipCode])
    .eq('active', true)
    .is('deleted_at', null)
    .order('day')
    .order('class_time')

  const { data, error } = await query
  assertData(data, error, 'getCampusSchedule')

  const results = data ?? []
  if (!batchId) return results

  // Filter slots to the requested batch when batchId is provided.
  return results.map(co => ({
    ...co,
    class_slots: (co.class_slots ?? []).filter(s => s.batch_id === batchId)
  })).filter(co => co.class_slots.length > 0)
}

/**
 * Returns all class options for a group/subgroup, optionally for a batch.
 * Replaces: GET ?action=getGroupSchedule
 * @param {{ groupId: string, subgroupId?: string, batchId?: string }} params
 * @returns {Promise<Array>}
 */
export async function getGroupSchedule({ groupId, subgroupId, batchId } = {}) {
  if (!groupId) throw new Error('groupId is required')

  let query = supabase
    .from('class_options')
    .select(`
      class_option_id,
      class_id,
      teacher_id,
      teacher_name,
      day,
      class_time,
      group_id,
      subgroup_id,
      fellowship_codes,
      active,
      enrollment_open,
      max_capacity,
      class_slots (
        class_slot_id,
        batch_id,
        current_enrolment,
        max_capacity,
        status
      )
    `)
    .eq('group_id', groupId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('subgroup_id')
    .order('day')
    .order('class_time')

  if (subgroupId) query = query.eq('subgroup_id', subgroupId)

  const { data, error } = await query
  assertData(data, error, 'getGroupSchedule')

  const results = data ?? []
  if (!batchId) return results

  return results.map(co => ({
    ...co,
    class_slots: (co.class_slots ?? []).filter(s => s.batch_id === batchId)
  }))
}

/**
 * Returns all active class slots, optionally filtered by batch and/or subgroup.
 * Replaces: GET ?action=getScheduledClasses
 * @param {{ batchId?: string, subgroupId?: string, status?: string }} [params]
 * @returns {Promise<Array>}
 */
export async function getScheduledClasses({ batchId, subgroupId, status } = {}) {
  let query = supabase
    .from('class_slots')
    .select(`
      class_slot_id,
      class_option_id,
      teacher_id,
      teacher_name,
      group_id,
      subgroup_id,
      batch_id,
      status,
      current_enrolment,
      max_capacity,
      class_options (
        class_id,
        day,
        class_time,
        fellowship_codes
      )
    `)
    .order('subgroup_id')
    .order('class_slot_id')

  if (batchId)    query = query.eq('batch_id', batchId)
  if (subgroupId) query = query.eq('subgroup_id', subgroupId)
  if (status)     query = query.eq('status', status)
  else            query = query.eq('status', 'Active')

  const { data, error } = await query
  assertData(data, error, 'getScheduledClasses')
  return data ?? []
}

/**
 * Submits (upserts) a teacher's finalized availability for a batch.
 * Replaces: POST ?action=submitAvailability
 * @param {Array<{ teacher_id, batch_id, day, time_slot, status, notes? }>} payload
 * @returns {Promise<{ inserted: number, updated: number }>}
 */
export async function submitAvailability(payload) {
  if (!Array.isArray(payload) || !payload.length) {
    throw new Error('No availability slots to submit')
  }

  // Fetch existing records for this teacher+batch to compute insert vs update count.
  const teacherId = payload[0]?.teacher_id
  const batchId   = payload[0]?.batch_id

  const { data: existing } = teacherId && batchId
    ? await supabase
        .from('teacher_availability')
        .select('id')
        .eq('teacher_id', teacherId)
        .eq('batch_id', batchId)
    : { data: [] }

  const existingIds = new Set((existing ?? []).map(r => r.id))

  const { data, error } = await supabase
    .from('teacher_availability')
    .upsert(payload, { onConflict: 'teacher_id,batch_id,day,time_slot' })
    .select('id')

  assertData(data, error, 'submitAvailability')

  const upserted = data ?? []
  const inserted = upserted.filter(r => !existingIds.has(r.id)).length
  const updated  = upserted.length - inserted

  return { inserted, updated }
}

/**
 * Marks a teacher_availability record as reviewed/approved by an admin.
 * Sets status to 'Available' if currently 'Tentative'; records reviewer identity.
 * Replaces: POST ?action=approveAvailability
 * @param {string} id         â€” teacher_availability UUID
 * @param {string} reviewedBy â€” name or email of the approving admin
 * @returns {Promise<{ id: string, class_option_id: string, class_slot_id: string }>}
 */
export async function approveAvailability(id, reviewedBy) {
  if (!id)         throw new Error('approveAvailability: id is required')
  if (!reviewedBy) throw new Error('approveAvailability: reviewedBy is required')

  const { data, error } = await supabase.rpc('approve_teacher_availability_atomic', {
    p_availability_id: id,
    p_actor_email:     reviewedBy,
    p_actor_id:        null,
  })

  if (error) throw new Error(error.message || 'Approval RPC failed')

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.ok) {
    throw new Error(result?.error || 'Approval failed')
  }

  return { id, class_option_id: result.class_option_id, class_slot_id: result.class_slot_id }
}

