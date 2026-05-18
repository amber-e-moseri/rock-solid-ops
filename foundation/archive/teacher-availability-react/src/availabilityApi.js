/**
 * availabilityApi.js  — Supabase-backed
 * Set in .env:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const FALLBACK_CAMPUSES = [
  { code: 'CMU',      name: 'Canadian Mennonite University',     group: 'CE', subgroup: 'CESGA', timezone: 'America/Winnipeg' },
  { code: 'YORK',     name: 'York University',                   group: 'CS', subgroup: 'CSGA',  timezone: 'America/Toronto'  },
  { code: 'UTM',      name: 'University of Toronto Mississauga', group: 'CS', subgroup: 'CSGB',  timezone: 'America/Toronto'  },
  { code: 'UALBERTA', name: 'University of Alberta',             group: 'WS', subgroup: 'WSGA',  timezone: 'America/Edmonton' },
];

// ── Helpers ───────────────────────────────────────────────────

function sbHeaders(extra = {}) {
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

async function sbGet(table, params = '') {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`,
    { headers: sbHeaders() }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${table} failed (${res.status}): ${txt}`);
  }
  return res.json();
}

function to24h(time12) {
  const m = String(time12 || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mi}:00`;
}

function to12h(time24) {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h  = parseInt(hStr, 10);
  const mi = mStr || '00';
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mi} ${ap}`;
}

// ── Public API ────────────────────────────────────────────────

export async function getCampuses() {
  try {
    const rows = await sbGet(
      'fellowship_map',
      'active=eq.true&select=fellowship_code,campus_name,group_id,subgroup_id,timezone&order=campus_name'
    );
    const normalized = rows
      .map(r => ({
        code:     r.fellowship_code,
        name:     r.campus_name,
        group:    r.group_id,
        subgroup: r.subgroup_id,
        timezone: r.timezone || 'America/Toronto',
      }))
      .filter(r => r.code && r.name);
    console.log('[TA] getCampuses:', normalized.length, 'rows');
    return normalized.length ? normalized : FALLBACK_CAMPUSES;
  } catch (e) {
    console.error('[TA] getCampuses failed — using fallback:', e.message);
    return FALLBACK_CAMPUSES;
  }
}

export async function getTeachers() {
  try {
    const rows = await sbGet(
      'teachers',
      'active=eq.true&deleted_at=is.null&select=teacher_id,full_name,email,group_id,subgroup_id&order=full_name'
    );
    return rows.map(r => ({
      teacherID:       r.teacher_id,
      teacherName:     r.full_name,
      teacherEmail:    r.email || '',
      teacherTimezone: 'America/Toronto',
    }));
  } catch (e) {
    console.error('[TA] getTeachers failed:', e.message);
    return [];
  }
}

export async function getScheduledClassConflicts(campusCodes) {
  try {
    if (!campusCodes) return [];
    const codes = String(campusCodes).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!codes.length) return [];
    const rows = await sbGet(
      'class_options',
      'active=eq.true&enrollment_open=eq.true&deleted_at=is.null&select=fellowship_codes,teacher_name,day,class_time'
    );
    const conflicts = [];
    rows.forEach(r => {
      const raw    = String(r.fellowship_codes || '{}').replace(/^\{|\}$/g, '');
      const fCodes = raw.split(',').map(s => s.trim().toUpperCase());
      if (codes.some(c => fCodes.includes(c)) && r.day && r.class_time) {
        const time12 = to12h(r.class_time);
        conflicts.push({ day: r.day, time: time12, label: `${r.teacher_name || 'Class'} — ${r.day} ${time12}` });
      }
    });
    return conflicts;
  } catch (e) {
    console.error('[TA] getScheduledClassConflicts failed:', e.message);
    return [];
  }
}

export async function loadAvailability({ teacherEmail }) {
  try {
    if (!teacherEmail) return [];
    const teachers = await sbGet('teachers', `email=eq.${encodeURIComponent(teacherEmail)}&active=eq.true&select=teacher_id`);
    if (!teachers.length) return [];
    const teacherId = teachers[0].teacher_id;
    const rows = await sbGet(
      'teacher_availability',
      `teacher_id=eq.${encodeURIComponent(teacherId)}&select=id,day,time_slot,status,notes,batch_id&order=day&order=time_slot`
    );
    return rows.map(r => ({
      recordId:    r.id,
      teacherDay:  r.day,
      teacherTime: to12h(r.time_slot),
      campusCode:  '',
      status:      r.status,
      notes:       r.notes,
    }));
  } catch (e) {
    console.error('[TA] loadAvailability failed:', e.message);
    return [];
  }
}

export async function submitAvailability(payload) {
  if (!Array.isArray(payload) || !payload.length) {
    throw new Error('No availability slots to submit');
  }

  console.log('[TA] submitAvailability — raw payload:', payload);

  // 1. Resolve teacher_id from email
  const uniqueEmails = [...new Set(payload.map(p => p.teacherEmail).filter(Boolean))];
  const teacherMap = {};
  for (const email of uniqueEmails) {
    try {
      const rows = await sbGet('teachers', `email=eq.${encodeURIComponent(email)}&select=teacher_id`);
      if (rows.length) {
        teacherMap[email] = rows[0].teacher_id;
        console.log('[TA] resolved teacher_id for', email, '→', rows[0].teacher_id);
      } else {
        console.warn('[TA] no teacher found for email:', email);
      }
    } catch (e) {
      console.error('[TA] teacher lookup failed for', email, e.message);
    }
  }

  // 2. Get active/open batch — no fallback hardcodes; fail explicitly if none found
  let batchId = null;
  try {
    const batches = await sbGet(
      'batches',
      'or=(active.eq.true,registration_open.eq.true)&archived=eq.false&order=start_date.desc&limit=1&select=batch_id'
    );
    if (batches.length) batchId = batches[0].batch_id;
    console.log('[TA] using batch_id:', batchId);
  } catch (_) {}

  if (!batchId) {
    console.error('[TA] No active or open batch found. Cannot submit availability.');
    return { ok: false, error: 'No active batch found. Please contact your administrator.' };
  }

  // 3. Build rows — one per slot
  const rows = [];
  for (const p of payload) {
    const teacher_id = teacherMap[p.teacherEmail] || p.teacherID || null;
    const time_slot  = to24h(p.teacherTime);

    if (!teacher_id) {
      console.warn('[TA] skipping slot — no teacher_id for:', p.teacherEmail, p.teacherID);
      continue;
    }
    if (!time_slot) {
      console.warn('[TA] skipping slot — could not parse time:', p.teacherTime);
      continue;
    }
    rows.push({
      teacher_id,
      day:       p.teacherDay,
      time_slot,
      batch_id:  batchId,
      status:    'Tentative',
      notes:     `Campus: ${p.campusCode || '—'} · ${p.month || ''} ${p.year || ''}`.trim(),
      created_by: p.teacherEmail || null,
    });
  }

  if (!rows.length) {
    throw new Error(
      `No valid rows to insert. Payload had ${payload.length} entries but none matched a teacher. ` +
      `Emails tried: ${uniqueEmails.join(', ')}. ` +
      `Make sure teachers are in the teachers table with matching email addresses.`
    );
  }

  console.log('[TA] inserting rows:', rows);

  // 4. Insert with upsert on the unique constraint
  const res = await fetch(`${SUPABASE_URL}/rest/v1/teacher_availability`, {
    method:  'POST',
    headers: sbHeaders({
      'Prefer': 'resolution=merge-duplicates,return=representation',
    }),
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('[TA] insert failed:', txt);
    throw new Error(`Submit failed: ${txt}`);
  }

  const result = await res.json();
  console.log('[TA] insert result:', result);
  return { inserted: result.length, updated: rows.length - result.length, deactivated: 0 };
}

export function buildDefaultConfig() {
  return {
    mode:    'supabase',
    appName: 'Foundation School Scheduler',
  };
}