// ── Config ────────────────────────────────────────────────────
import { supabase } from "../auth/auth-client.js"

const SUPABASE_URL = String(window.FS_CONFIG?.SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = String(window.FS_CONFIG?.SUPABASE_ANON_KEY || '').trim()
const AdminUi = window.FSAdminUi
if (!AdminUi) {
  throw new Error('Missing shared admin module: ../js/admin-ui.js')
}

// ── State ─────────────────────────────────────────────────────
let db, currentUser, adminProfile
let suspendTarget    = null   // { type: 'teacher'|'availability', id, label }
let currentBatches   = []     // cached batch list for batch management
let batchModalMode   = 'create' // 'create' | 'edit'
let batchModalId     = null   // batch_id being edited
let moodleModalBatchId = null // batch_id open in Moodle config modal
const QUERY_ROW_CAP = 5000

// ── Init ──────────────────────────────────────────────────────
async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[FS_CONFIG_ERROR] Missing runtime config: SUPABASE_URL/SUPABASE_ANON_KEY')
    showAccessDenied('Configuration is missing. Please set foundation/js/config.js before using the admin portal.')
    return
  }
  db = supabase

  try {
    const { data: { session } } = await db.auth.getSession()
    if (!session) { window.location.href = 'login.html'; return }

    const { data: { user }, error: uErr } = await db.auth.getUser()
    if (uErr || !user) { window.location.href = 'login.html'; return }
    currentUser = user

    const { data: profile, error: pErr } = await db
      .from('admin_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (pErr || !profile) {
      const msg = pErr?.code === '42P01'
        ? 'The admin_users table does not exist yet. Please run the SQL migration first.'
        : 'No admin profile found for this account.'
      showAccessDenied(msg)
      return
    }

    adminProfile = profile
    renderPortal()
  } catch (e) {
    console.error('Init error:', e)
    showAccessDenied('Unexpected error loading portal: ' + e.message)
  }
}

async function logout() {
  try { await db.auth.signOut() } catch(e) { console.error(e) }
  window.location.href = 'login.html'
}

function showAccessDenied(msg) {
  document.getElementById('loading-screen').style.display = 'none'
  if (msg) document.getElementById('denied-msg').textContent = msg
  const el = document.getElementById('access-denied')
  el.style.display = 'flex'
}

function safeInvokeLoader(fnName, moduleName, targetSectionId) {
  const fn = window[fnName]
  if (typeof fn === 'function') {
    fn()
    return
  }
  const msg = `Portal module unavailable: ${moduleName}`
  console.error(msg)
  if (targetSectionId) {
    setError(targetSectionId, msg)
  } else {
    toast(msg, 'error')
  }
}

// ── Role helpers ──────────────────────────────────────────────
function isSuperadmin()    { return adminProfile?.role === 'superadmin' }
function isSubgroupAdmin() { return adminProfile?.role === 'subgroup_admin' }
function isPastor()        { return adminProfile?.role === 'pastor' }
function canApprove()      { return isSuperadmin() }
function canSuspend()      { return isSuperadmin() || isPastor() }

// Applies subgroup filter for non-superadmins
function scopeQuery(query, col) {
  col = col || 'subgroup_id'
  if (isSuperadmin()) return query
  const sg = adminProfile?.subgroups || []
  return sg.length ? query.in(col, sg) : query.in(col, ['__NONE__'])
}

// ── Render portal ─────────────────────────────────────────────
function renderPortal() {
  document.getElementById('loading-screen').style.display = 'none'
  document.getElementById('portal').style.display = 'block'
  if (window.FSAdminShell && !document.getElementById('fs-admin-sb')) {
    window.FSAdminShell.mount({
      active: 'portal',
      pageTitle: 'Admin Portal',
      role: adminProfile.role,
      profileName: adminProfile.full_name,
      onLogout: logout
    })
  } else if (window.FSAdminShell) {
    window.FSAdminShell.setPageTitle('Admin Portal')
    window.FSAdminShell.setProfile(adminProfile.full_name, null)
  }

  const main = document.getElementById('main')
  main.innerHTML = ''

  if (isSuperadmin()) {
    main.append(
      mkSection('batch-mgmt',         'Batch Management',
        '<button class="btn-sm btn-approve" onclick="openBatchModal(null)">+ Create Batch</button>'),
      mkSection('admin-tools',        'Admin Tools'),
      mkSection('pending-teachers',   'Pending Teacher Approvals'),
      mkSection('suspended-teachers', 'Suspended Teachers Review'),
      mkSection('pending-avail',      'Pending Availability Approvals'),
      mkSection('dashboards',         'Subgroup Dashboards'),
      mkSection('admin-users',        'Admin Users')
    )
    safeInvokeLoader('loadBatchManagement', 'Batch Management', 'batch-mgmt')
    safeInvokeLoader('loadAdminTools', 'Admin Tools', 'admin-tools')
    safeInvokeLoader('loadPendingTeachers', 'Pending Teacher Approvals', 'pending-teachers')
    safeInvokeLoader('loadSuspendedTeachers', 'Suspended Teachers Review', 'suspended-teachers')
    safeInvokeLoader('loadPendingAvail', 'Pending Availability Approvals', 'pending-avail')
    safeInvokeLoader('loadDashboards', 'Subgroup Dashboards', 'dashboards')
    safeInvokeLoader('loadAdminUsers', 'Admin Users', 'admin-users')
  } else {
    main.append(
      mkSection('students',    'Students'),
      mkSection('attendance',  'Attendance Overview'),
      mkSection('graduation',  'Graduation Progress')
    )
    loadStudents()
    loadAttendance()
    loadGraduation()

    if (isSubgroupAdmin()) {
      main.append(mkSection('notes', 'Student Notes & Flags'))
      loadNotes()
    }

    if (isPastor()) {
      main.append(
        mkSection('teachers',     'Teachers'),
        mkSection('avail-pastor', 'Teacher Availability')
      )
      loadTeachers()
      loadAvailPastor()
    }
  }
}

// ── Section helpers ───────────────────────────────────────────
function mkSection(id, title, headerActionsHtml) {
  const s = document.createElement('section')
  s.className = 'section'
  s.id = 'sec-' + id
  s.innerHTML = `
    <div class="section-header">
      <h2>${title}</h2>
      ${headerActionsHtml ? `<div class="section-header-actions">${headerActionsHtml}</div>` : ''}
    </div>
    <div class="section-body" id="sb-${id}"><div class="loading-state">Loading…</div></div>`
  return s
}

function sb(id)  { return document.getElementById('sb-' + id) }

function setHtml(id, html) {
  const el = sb(id)
  if (el) el.innerHTML = html
}

function setError(id, msg, raw) {
  setHtml(id, `<div class="error-state">${msg}${raw ? `<small>${esc(raw)}</small>` : ''}</div>`)
}

function openPortalPage(path, accessLabel) {
  if (accessLabel && accessLabel !== 'all') {
    const role = adminProfile?.role || ''
    if (accessLabel === 'superadmin' && role !== 'superadmin') {
      toast('You are logged in but your role does not have access to Batch Management', 'error')
      return
    }
  }
  window.location.href = path
}

async function openNotificationCenter() {
  try {
    const res = await fetch('notification-center.html', { method: 'GET', cache: 'no-store' })
    if (!res.ok) {
      toast('Notification Center is unavailable.', 'error')
      return
    }
    window.location.href = 'notification-center.html'
  } catch (_) {
    toast('Notification Center is unavailable.', 'error')
  }
}

function loadBatchManagement() {
  setHtml('batch-mgmt', `
    <p style="margin-bottom:12px;color:var(--muted);">Open the dedicated Batch Management workspace.</p>
    <button class="btn-primary" onclick="openPortalPage('batch-management.html','superadmin')">Open Batch Management</button>
  `)
}
window.loadBatchManagement = loadBatchManagement

function loadAdminTools() {
  setHtml('admin-tools', `
    <div class="actions">
      <button class="btn-sm btn-approve" onclick="openPortalPage('batch-management.html','superadmin')">Batch Management</button>
      <button class="btn-sm btn-reinstate" onclick="openPortalPage('audit-log.html','all')">Audit Log</button>
      <button class="btn-sm btn-reinstate" onclick="openPortalPage('failed-sync-retry-center.html','all')">Retry Center</button>
      <button class="btn-sm btn-reinstate" onclick="openPortalPage('system-health.html','all')">System Health</button>
      <button class="btn-sm btn-reinstate" onclick="openPortalPage('email-campaigns.html','all')">Email Campaigns</button>
      <button class="btn-sm btn-reinstate" onclick="openPortalPage('dashboards.html','all')">Dashboards</button>
      <button class="btn-sm btn-reinstate" onclick="openNotificationCenter()">Notification Center</button>
    </div>
  `)
}
window.loadAdminTools = loadAdminTools

function mkTable(heads, rows) {
  if (!rows.length) return '<p class="empty-state">No records found.</p>'
  const cards = rows.map((r) => {
    const primary = r[0] || 'Record'
    const meta = r.slice(1, Math.max(1, r.length - 1)).map((c, i) => `<div class="meta-row"><strong>${heads[i + 1] || ''}:</strong> ${c}</div>`).join('')
    const action = r[r.length - 1] || ''
    return `<article class="table-mobile-card">
      <div class="table-mobile-title">${primary}</div>
      <div class="table-mobile-meta">${meta}</div>
      <div class="table-mobile-actions">${action}</div>
    </article>`
  }).join('')
  return `<div class="table-wrap"><table>
    <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div><div class="table-mobile-cards">${cards}</div>`
}

const esc = (s) => AdminUi.esc(s)
const fmtDate = (v) => AdminUi.fmtDate(v)
const fmtTime = (v) => AdminUi.fmtTime(v)

function roleBadgeHtml(r) {
  const map = { superadmin: 'Superadmin', subgroup_admin: 'Subgroup Admin', pastor: 'Pastor' }
  return `<span class="badge badge-${esc(r)}">${esc(map[r] || r)}</span>`
}

function statusBadge(s) {
  const cls = {
    Active:'active', Pending:'pending', Rejected:'rejected',
    Suspended:'suspended', SuspendedConfirmed:'suspendedconfirmed',
    Ready:'ready', Close:'close', 'Not Ready':'not-ready',
    Available:'active', Tentative:'pending', Unavailable:'rejected'
  }[s] || 'not-ready'
  return `<span class="badge badge-${cls}">${esc(s)}</span>`
}

async function btnAction(btn, label, fn) {
  const orig = btn.textContent
  btn.disabled = true
  btn.textContent = label || 'Loading…'
  try { await fn() }
  finally { btn.disabled = false; btn.textContent = orig }
}

// ── Superadmin: Pending Teacher Approvals ─────────────────────
async function loadPendingTeachers() {
  try {
    const { data, error } = await db.from('teachers')
      .select('teacher_id, full_name, email, subgroup_id, group_id, created_at')
      .eq('status', 'Pending')
      .is('deleted_at', null)
      .order('created_at')

    if (error) throw error

    const rows = (data || []).map(t => [
      esc(t.full_name), esc(t.email || '—'), esc(t.subgroup_id || '—'),
      esc(t.group_id || '—'), fmtDate(t.created_at),
      `<div class="actions">
        <button class="btn-sm btn-approve" onclick="approveTeacher('${esc(t.teacher_id)}', this)">Approve</button>
        <button class="btn-sm btn-reject"  onclick="rejectTeacher('${esc(t.teacher_id)}', this)">Reject</button>
      </div>`
    ])
    setHtml('pending-teachers', mkTable(['Name','Email','Subgroup','Group','Applied','Actions'], rows))
  } catch (e) {
    console.error(e)
    setError('pending-teachers', 'Could not load pending teachers.', e.message)
  }
}

async function approveTeacher(id, btn) {
  await btnAction(btn, 'Approving...', async () => {
    const actorEmail = String(adminProfile?.email || currentUser?.email || '').trim() || null
    const updated = await FSAdminApi.updateTeacherStatus(db, id, 'ACTIVE', actorEmail)
    await FSAdminApi.logTeacherAudit(db, 'TEACHER_APPROVED', id, {
      to_status: 'ACTIVE',
      teacher_name: updated?.full_name || null,
      teacher_email: updated?.email || null,
    }, actorEmail)
    toast('Teacher approved.')
    loadPendingTeachers()
  })
}

async function rejectTeacher(id, btn) {
  if (!confirm('Reject this teacher application? This cannot be undone.')) return
  const reason = String(prompt('Optional rejection reason:', '') || '').trim() || null
  await btnAction(btn, 'Rejecting...', async () => {
    const actorEmail = String(adminProfile?.email || currentUser?.email || '').trim() || null
    const updated = await FSAdminApi.updateTeacherStatus(db, id, 'INACTIVE', actorEmail, reason)
    await FSAdminApi.logTeacherAudit(db, 'TEACHER_REJECTED', id, {
      to_status: 'INACTIVE',
      reason,
      teacher_name: updated?.full_name || null,
      teacher_email: updated?.email || null,
    }, actorEmail)
    toast('Teacher rejected.', 'error')
    loadPendingTeachers()
  })
}

// ── Superadmin: Suspended Teachers ───────────────────────────
async function loadSuspendedTeachers() {
  try {
    const { data, error } = await db.from('teachers')
      .select('teacher_id, full_name, email, subgroup_id, suspended_reason, suspended_by, suspended_at')
      .eq('status', 'Suspended')
      .is('deleted_at', null)
      .order('suspended_at')

    if (error) throw error

    const rows = (data || []).map(t => [
      esc(t.full_name), esc(t.email || '—'), esc(t.subgroup_id || '—'),
      esc(t.suspended_reason || '—'), esc(t.suspended_by || '—'), fmtDate(t.suspended_at),
      `<div class="actions">
        <button class="btn-sm btn-confirm"   onclick="confirmSuspension('${esc(t.teacher_id)}', this)">Confirm Suspension</button>
        <button class="btn-sm btn-reinstate" onclick="reinstateTeacher('${esc(t.teacher_id)}', this)">Override & Reinstate</button>
      </div>`
    ])
    setHtml('suspended-teachers', mkTable(['Name','Email','Subgroup','Reason','Suspended By','Suspended At','Actions'], rows))
  } catch (e) {
    console.error(e)
    setError('suspended-teachers', 'Could not load suspended teachers.', e.message)
  }
}

async function confirmSuspension(id, btn) {
  if (!confirm('Confirm this suspension? The teacher will remain inactive.')) return
  await btnAction(btn, 'Confirming…', async () => {
    const { error } = await db.from('teachers')
      .update({ active: false, status: 'SuspendedConfirmed', reviewed_at: new Date().toISOString(), reviewed_by: currentUser.id })
      .eq('teacher_id', id)
    if (error) throw error
    toast('Suspension confirmed.')
    loadSuspendedTeachers()
  })
}

async function reinstateTeacher(id, btn) {
  if (!confirm('Override suspension and reinstate this teacher?')) return
  await btnAction(btn, 'Reinstating…', async () => {
    const { error } = await db.from('teachers')
      .update({ active: true, status: 'Active', suspended_reason: null, suspended_by: null, suspended_at: null, reviewed_at: new Date().toISOString(), reviewed_by: currentUser.id })
      .eq('teacher_id', id)
    if (error) throw error
    toast('Teacher reinstated.')
    loadSuspendedTeachers()
  })
}

// ── Superadmin: Pending Availability ─────────────────────────
async function loadPendingAvail() {
  try {
    const { data, error } = await db.from('teacher_availability')
      .select('id, teacher_id, subgroup_id, day, time_slot, batch_id, teachers(full_name)')
      .eq('status', 'Tentative')
      .order('created_at')

    if (error) throw error

    const rows = (data || []).map(r => [
      esc(r.teachers?.full_name || r.teacher_id), esc(r.subgroup_id || '—'),
      esc(r.day || '—'), fmtTime(r.time_slot), esc(r.batch_id || '2025A'),
      `<div class="actions">
        <button class="btn-sm btn-approve" onclick="approveAvail('${esc(r.id)}', this)">Approve</button>
        <button class="btn-sm btn-reject"  onclick="rejectAvail('${esc(r.id)}', this)">Reject</button>
      </div>`
    ])
    setHtml('pending-avail', mkTable(['Teacher','Subgroup','Day','Time','Batch','Actions'], rows))
  } catch (e) {
    console.error(e)
    setError('pending-avail', 'Could not load pending availability.', e.message)
  }
}

async function approveAvail(id, btn) {
  await btnAction(btn, 'Approving…', async () => {
    const actorEmail = String(adminProfile?.email || currentUser?.email || '').trim() || null
    const actorId = String(currentUser?.id || '').trim() || null
    const { data, error } = await db.rpc('approve_teacher_availability_atomic', {
      p_availability_id: id,
      p_actor_email: actorEmail,
      p_actor_id: actorId
    })

    if (error) {
      const message = error.message || 'RPC approval failed.'
      try {
        await db.from('audit_logs').insert({
          actor_email: actorEmail,
          actor_id: actorId,
          action: 'TEACHER_AVAIL_APPROVAL_FAILED',
          entity_type: 'teacher_availability',
          entity_id: id,
          status: 'FAILED',
          details: { reason: message }
        })
      } catch (_) {
        // best-effort audit
      }
      throw new Error(message)
    }

    const result = Array.isArray(data) ? data[0] : data
    if (!result?.ok) {
      const message = String(result?.error || 'Approval failed.').trim()
      try {
        await db.from('audit_logs').insert({
          actor_email: actorEmail,
          actor_id: actorId,
          action: 'TEACHER_AVAIL_APPROVAL_FAILED',
          entity_type: 'teacher_availability',
          entity_id: id,
          status: 'FAILED',
          details: {
            reason: message,
            class_option_id: result?.class_option_id || null,
            class_slot_id: result?.class_slot_id || null
          }
        })
      } catch (_) {
        // best-effort audit
      }
      throw new Error(message)
    }

    toast('Availability approved. Class created.')
    loadPendingAvail()
  })
}

async function rejectAvail(id, btn) {
  if (!confirm('Reject this availability slot?')) return
  await btnAction(btn, 'Rejecting…', async () => {
    const { error } = await db.from('teacher_availability')
      .update({ status: 'Unavailable' })
      .eq('id', id)
    if (error) throw error
    toast('Availability rejected.', 'error')
    loadPendingAvail()
  })
}

// ── Superadmin: Dashboards ────────────────────────────────────
async function loadDashboards() {
  try {
    const [fmRes, stuRes, attRes, gradRes] = await Promise.all([
      db.from('fellowship_map').select('group_id, subgroup_id').eq('active', true),
      db.from('students').select('subgroup_id, status').is('deleted_at', null),
      db.from('attendance_log').select('subgroup_id, present'),
      db.from('graduation_review').select('subgroup_id, all_gates_met')
    ])
    if (fmRes.error)  throw fmRes.error
    if (stuRes.error) throw stuRes.error

    const map = new Map()
    for (const r of fmRes.data || []) {
      if (!map.has(r.subgroup_id))
        map.set(r.subgroup_id, { g: r.group_id, total: 0, active: 0, present: 0, graduated: 0 })
    }
    for (const r of stuRes.data  || []) { if (map.has(r.subgroup_id)) { map.get(r.subgroup_id).total++; if (r.status === 'Active') map.get(r.subgroup_id).active++ } }
    for (const r of attRes.data  || []) { if (r.present && map.has(r.subgroup_id)) map.get(r.subgroup_id).present++ }
    for (const r of gradRes.data || []) { if (r.all_gates_met && map.has(r.subgroup_id)) map.get(r.subgroup_id).graduated++ }

    if (!map.size) { setHtml('dashboards', '<p class="empty-state">No subgroup data found in fellowship_map.</p>'); return }

    const cards = [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([sg, d]) => `
      <div class="dash-card">
        <div class="dash-card-header"><span class="dash-subgroup">${esc(sg)}</span><span class="dash-group">${esc(d.g)}</span></div>
        <div class="dash-metrics">
          <div><span class="metric-val">${d.total}</span><span class="metric-label">Total Students</span></div>
          <div><span class="metric-val">${d.active}</span><span class="metric-label">Active</span></div>
          <div><span class="metric-val">${d.present}</span><span class="metric-label">Present (all-time)</span></div>
          <div><span class="metric-val">${d.graduated}</span><span class="metric-label">Graduated</span></div>
        </div>
      </div>`).join('')
    setHtml('dashboards', `<div class="dash-grid">${cards}</div>`)
  } catch (e) {
    console.error(e)
    setError('dashboards', 'Dashboard data unavailable. Check table/column names.', e.message)
  }
}

// ── Superadmin: Admin Users ───────────────────────────────────
async function loadAdminUsers() {
  try {
    const { data, error } = await db.from('admin_users')
      .select('full_name, email, role, subgroups, group_ids')
      .order('full_name')
    if (error) throw error

    const rows = (data || []).map(u => [
      esc(u.full_name), esc(u.email), roleBadgeHtml(u.role),
      esc((u.subgroups || []).join(', ') || '—'),
      esc((u.group_ids || []).join(', ') || '—')
    ])
    setHtml('admin-users', mkTable(['Name','Email','Role','Subgroups','Groups'], rows))
  } catch (e) {
    console.error(e)
    setError('admin-users', 'Could not load admin users.', e.message)
  }
}

// ── Shared: Students ──────────────────────────────────────────
async function loadStudents() {
  try {
    let q = db.from('students')
      .select('student_id, full_name, email, fellowship_code, subgroup_id, status, needs_attention_flag, needs_attention_reason')
      .is('deleted_at', null)
      .order('full_name')
      .limit(150)
    q = scopeQuery(q)
    const { data, error } = await q
    if (error) throw error

    const rows = (data || []).map(s => [
      esc(s.student_id), esc(s.full_name), esc(s.email || '—'),
      esc(s.fellowship_code || '—'), statusBadge(s.status || 'Active'),
      s.needs_attention_flag
        ? `<span class="flag-on" title="${esc(s.needs_attention_reason || '')}">⚑ Flagged</span>`
        : `<span class="flag-off">—</span>`
    ])
    const note = (data || []).length === 150 ? '<p style="color:var(--muted);font-size:12px;margin-top:10px">Showing first 150 records.</p>' : ''
    setHtml('students', mkTable(['ID','Name','Email','Fellowship','Status','Attention'], rows) + note)
  } catch (e) {
    console.error(e)
    setError('students', 'Could not load students.', e.message)
  }
}

// ── Shared: Attendance ────────────────────────────────────────
async function loadAttendance() {
  try {
    let q = db.from('attendance_log').select('subgroup_id, present')
    q = scopeQuery(q)
    const { data, error } = await q
    if (error) throw error

    // Group by subgroup
    const map = new Map()
    for (const r of data || []) {
      const sg = r.subgroup_id || '(unknown)'
      if (!map.has(sg)) map.set(sg, { total: 0, present: 0 })
      map.get(sg).total++
      if (r.present) map.get(sg).present++
    }

    if (!map.size) { setHtml('attendance', '<p class="empty-state">No attendance records found.</p>'); return }

    const rows = [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([sg, d]) => {
      const rate = d.total ? Math.round(d.present / d.total * 100) : 0
      return [esc(sg), d.total, d.present, d.total - d.present, `${rate}%`]
    })
    setHtml('attendance', mkTable(['Subgroup','Total Records','Present','Absent','Attendance Rate'], rows))
  } catch (e) {
    console.error(e)
    setError('attendance', 'Could not load attendance data.', e.message)
  }
}

// ── Shared: Graduation ────────────────────────────────────────
async function loadGraduation() {
  try {
    let q = db.from('graduation_review')
      .select('student_id, subgroup_id, gate1_attendance, gate2_assignments, gate3_exam_passed, gate4_cell_integrated, all_gates_met, graduation_status, students(full_name)')
      .order('graduation_status')
      .limit(200)
    q = scopeQuery(q)
    const { data, error } = await q
    if (error) throw error

    function gIcon(v) { return v ? '<span class="gate-ok">✓</span>' : '<span class="gate-no">✗</span>' }
    const rows = (data || []).map(r => [
      esc(r.students?.full_name || r.student_id),
      esc(r.subgroup_id || '—'),
      gIcon(r.gate1_attendance), gIcon(r.gate2_assignments),
      gIcon(r.gate3_exam_passed), gIcon(r.gate4_cell_integrated),
      statusBadge(r.graduation_status || 'Not Ready')
    ])
    setHtml('graduation', mkTable(['Student','Subgroup','G1 Attend','G2 Assign','G3 Exam','G4 Cell','Status'], rows))
  } catch (e) {
    console.error(e)
    setError('graduation', 'Could not load graduation data.', e.message)
  }
}

// ── Subgroup Admin: Notes ─────────────────────────────────────
async function loadNotes() {
  try {
    let q = db.from('students')
      .select('student_id, full_name, subgroup_id, needs_attention_reason')
      .eq('needs_attention_flag', true)
      .is('deleted_at', null)
      .order('full_name')
    q = scopeQuery(q)
    const { data, error } = await q
    if (error) throw error

    const rows = (data || []).map(s => [
      esc(s.full_name), esc(s.subgroup_id || '—'), esc(s.needs_attention_reason || '—')
    ])
    setHtml('notes', mkTable(['Student','Subgroup','Reason / Note'], rows))
  } catch (e) {
    console.error(e)
    setError('notes', 'Could not load student notes.', e.message)
  }
}

// ── Pastor: Teachers ──────────────────────────────────────────
async function loadTeachers() {
  try {
    let q = db.from('teachers')
      .select('teacher_id, full_name, email, subgroup_id, status, active')
      .is('deleted_at', null)
      .order('full_name')
      .range(0, QUERY_ROW_CAP - 1)
    q = scopeQuery(q)
    const { data, error } = await q
    if (error) throw error

    const rows = (data || []).map(t => {
      const canSusp = t.status !== 'Suspended' && t.status !== 'SuspendedConfirmed'
      return [
        esc(t.full_name), esc(t.email || '—'), esc(t.subgroup_id || '—'),
        statusBadge(t.status || (t.active ? 'Active' : 'Inactive')),
        canSusp
          ? `<button class="btn-sm btn-suspend" onclick="openModal('teacher','${esc(t.teacher_id)}','${esc(t.full_name)}')">Suspend</button>`
          : `<span style="color:var(--muted);font-size:12px">Already suspended</span>`
      ]
    })
    setHtml('teachers', mkTable(['Name','Email','Subgroup','Status','Action'], rows))
  } catch (e) {
    console.error(e)
    setError('teachers', 'Could not load teachers.', e.message)
  }
}

// ── Pastor: Availability ──────────────────────────────────────
async function loadAvailPastor() {
  try {
    // Get teacher IDs in this pastor's subgroups
    let tq = db.from('teachers')
      .select('teacher_id')
      .is('deleted_at', null)
      .range(0, QUERY_ROW_CAP - 1)
    tq = scopeQuery(tq)
    const { data: tData, error: tErr } = await tq
    if (tErr) throw tErr

    const ids = (tData || []).map(t => t.teacher_id)
    if (!ids.length) { setHtml('avail-pastor', '<p class="empty-state">No teachers in your subgroups.</p>'); return }

    const { data, error } = await db.from('teacher_availability')
      .select('id, teacher_id, subgroup_id, day, time_slot, status, batch_id, teachers(full_name)')
      .in('teacher_id', ids)
      .order('day')
      .range(0, QUERY_ROW_CAP - 1)

    if (error) throw error

    const rows = (data || []).map(r => {
      const canSusp = r.status !== 'Suspended'
      return [
        esc(r.teachers?.full_name || r.teacher_id), esc(r.day || '—'), fmtTime(r.time_slot),
        statusBadge(r.status), esc(r.batch_id || '—'),
        canSusp
          ? `<button class="btn-sm btn-suspend" onclick="openModal('availability','${esc(r.id)}','${esc(r.teachers?.full_name || r.teacher_id)} — ${esc(r.day)} ${fmtTime(r.time_slot)}')">Suspend</button>`
          : `<span style="color:var(--muted);font-size:12px">Suspended</span>`
      ]
    })
    setHtml('avail-pastor', mkTable(['Teacher','Day','Time','Status','Batch','Action'], rows))
  } catch (e) {
    console.error(e)
    setError('avail-pastor', 'Could not load availability.', e.message)
  }
}

// ── Modal: Suspend ────────────────────────────────────────────
function openModal(type, id, label) {
  suspendTarget = { type, id, label }
  document.getElementById('modal-title').textContent  = type === 'teacher' ? 'Suspend Teacher' : 'Suspend Availability'
  document.getElementById('modal-entity').textContent = label
  document.getElementById('modal-reason').value       = ''
  document.getElementById('modal-err').classList.remove('show')
  document.getElementById('modal-err').textContent    = ''
  document.getElementById('modal-overlay').classList.add('open')
  document.getElementById('modal-reason').focus()
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open')
  suspendTarget = null
}

async function confirmSuspend() {
  const reason = document.getElementById('modal-reason').value.trim()
  const errEl  = document.getElementById('modal-err')
  errEl.classList.remove('show')

  if (!reason) {
    errEl.textContent = 'A reason is required before submitting.'
    errEl.classList.add('show')
    return
  }

  const btn = document.getElementById('modal-submit')
  btn.disabled = true
  btn.textContent = 'Suspending…'

  try {
    const now = new Date().toISOString()
    if (suspendTarget.type === 'teacher') {
      const { error } = await db.from('teachers').update({
        active: false, status: 'Suspended',
        suspended_reason: reason, suspended_by: currentUser.id, suspended_at: now
      }).eq('teacher_id', suspendTarget.id)
      if (error) throw error

      await db.from('sync_log').insert({
        phase: 'PASTOR_SUSPENSION', message: reason,
        details: { entity_type: 'teacher', entity_id: suspendTarget.id, label: suspendTarget.label },
        run_by: currentUser.id
      })
      closeModal()
      toast('Teacher suspended.')
      loadTeachers()
    } else {
      const { error } = await db.from('teacher_availability').update({
        status: 'Suspended',
        suspended_reason: reason, suspended_by: currentUser.id, suspended_at: now
      }).eq('id', suspendTarget.id)
      if (error) throw error

      await db.from('sync_log').insert({
        phase: 'PASTOR_SUSPENSION', message: reason,
        details: { entity_type: 'teacher_availability', entity_id: suspendTarget.id, label: suspendTarget.label },
        run_by: currentUser.id
      })
      closeModal()
      toast('Availability suspended.')
      loadAvailPastor()
    }
  } catch (e) {
    console.error(e)
    errEl.textContent = e.message || 'Suspension failed. Please try again.'
    errEl.classList.add('show')
  } finally {
    btn.disabled = false
    btn.textContent = 'Confirm Suspension'
  }
}

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal()
})

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type) {
  type = type || 'success'
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.textContent = msg
  document.getElementById('toasts').appendChild(el)
  setTimeout(() => el.remove(), 4000)
}

// ── Boot ──────────────────────────────────────────────────────
init()

