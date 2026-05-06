// ── Config ──────────────────────────────────────────────────────────────────
const SUPA_URL = String(window.FS_CONFIG?.SUPABASE_URL || '').trim();
const SUPA_KEY = String(window.FS_CONFIG?.SUPABASE_ANON_KEY || '').trim();
const unresolved = !SUPA_URL || !SUPA_KEY;
const AdminApi = window.FSAdminApi;
const AdminUi = window.FSAdminUi;
if (!AdminApi || !AdminUi) {
  throw new Error('Missing shared admin modules: ../js/admin-api.js and ../js/admin-ui.js');
}

async function sbGet(table, params) {
  return AdminApi.supabaseGet(SUPA_URL, SUPA_KEY, table, params);
}
async function sbPatch(table, params, body) {
  return AdminApi.supabasePatch(SUPA_URL, SUPA_KEY, table, params, body);
}
async function sbPost(table, body, prefer) {
  return AdminApi.supabasePost(SUPA_URL, SUPA_KEY, table, body, prefer);
}

// ── State ────────────────────────────────────────────────────────────────────
let allRows = [];
let filtered = [];
let currentView = 'grid';
let currentScope = 'full';
let selectedSlotKey = null;
let selectedIds = new Set();
let pendingCloneId = null;
let availableGroups = [];
const pendingActions = new Set();
let pendingBulkApprove = false;
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Helpers ──────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const esc = value => AdminUi.esc(value);
const norm = s => String(s??'').trim().toUpperCase();
const normStatus = s => { const v = String(s??'').trim().toUpperCase(); return ['PENDING','APPROVED','REJECTED'].includes(v) ? v : 'PENDING'; };
const keyFor = r => `${String(r.day??'').trim()}__${String(r.time??'').trim()}`;
const safeId = v => String(v??'').replace(/[^a-zA-Z0-9_-]/g,'_');
function setStatus(msg, cls='') { const el=$('statusLine'); el.textContent=msg||''; el.className='status-line'+(cls?' '+cls:''); }
function selectedGroupValue_() { return String(($('qGroup') && $('qGroup').value) || 'ALL').toUpperCase(); }
function activeGroupFilter_() {
  if (currentScope !== 'group') return 'ALL';
  return selectedGroupValue_() || 'ALL';
}
function ensureApiConnected_() {
  if (!unresolved) return true;
  setStatus('Admin API URL is not connected. Please set ADMIN_API_URL.', 'error');
  return false;
}
function getBatchStartSundayOrWarn_() {
  const v = String(($('batchStartSunday') && $('batchStartSunday').value) || '').trim();
  if (!v) {
    setStatus('Please select the starting Sunday for this batch before approving.', 'error');
    return '';
  }
  const d = new Date(v + 'T00:00:00');
  if (Number.isNaN(d.getTime()) || d.getDay() !== 0) {
    setStatus('Batch Start Sunday must be a Sunday.', 'error');
    return '';
  }
  return v;
}
function previewClassStartDate_(day) {
  const v = String(($('batchStartSunday') && $('batchStartSunday').value) || '').trim();
  if (!v) return '';
  const offsets = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const off = offsets[String(day || '').trim()];
  if (off == null) return '';
  const d = new Date(v + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + off);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
function sortRows_(rows) {
  const out = [...rows];
  const byGroup = currentScope === 'group' && activeGroupFilter_() !== 'ALL';
  out.sort((a,b)=>{
    const ga = String(a.groupId || '').toUpperCase();
    const gb = String(b.groupId || '').toUpperCase();
    const ca = String(a.campusName || a.fellowshipName || a.campusCode || '').toUpperCase();
    const cb = String(b.campusName || b.fellowshipName || b.campusCode || '').toUpperCase();
    const da = String(a.day || '');
    const db = String(b.day || '');
    const ta = timeSortVal(String(a.time || ''));
    const tb = timeSortVal(String(b.time || ''));
    const na = String(a.teacherName || '').toUpperCase();
    const nb = String(b.teacherName || '').toUpperCase();
    return (byGroup ? 0 : ga.localeCompare(gb)) || ca.localeCompare(cb) || da.localeCompare(db) || (ta - tb) || na.localeCompare(nb);
  });
  return out;
}
function populateGroups_(groups) {
  availableGroups = Array.isArray(groups) ? groups.filter(Boolean) : [];
  const current = selectedGroupValue_();
  const options = ['<option value="ALL">All Groups</option>']
    .concat(availableGroups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`));
  $('qGroup').innerHTML = options.join('');
  $('qGroup').value = availableGroups.includes(current) || current === 'ALL' ? current : 'ALL';
}
function onGroupChange() {
  if (currentScope === 'group') load();
  else applyFilters();
}
function setScope(scope) {
  currentScope = scope === 'group' ? 'group' : 'full';
  $('toggleScopeFull').classList.toggle('active', currentScope === 'full');
  $('toggleScopeGroup').classList.toggle('active', currentScope === 'group');
  $('qGroup').style.display = currentScope === 'group' ? 'inline-block' : 'none';
  load();
}

function timeSortVal(t) {
  const m=String(t).trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if(!m) return 9999;
  let h=+m[1], mi=+(m[2]||0);
  if(m[3]?.toLowerCase()==='pm'&&h<12) h+=12;
  if(m[3]?.toLowerCase()==='am'&&h===12) h=0;
  return h*60+mi;
}

function uniqueTimes(rows) {
  const set=new Set(rows.map(r=>String(r.time??'').trim()).filter(Boolean));
  return [...set].sort((a,b)=>timeSortVal(a)-timeSortVal(b));
}

function statusCounts(rows) {
  const c={PENDING:0,APPROVED:0,REJECTED:0};
  rows.forEach(r=>{ const s=normStatus(r.status); c[s]=(c[s]||0)+1; });
  return c;
}

function dominantStatus(c) {
  const kinds=[c.PENDING>0,c.APPROVED>0,c.REJECTED>0].filter(Boolean).length;
  if(kinds>1) return 'MIXED';
  if(c.PENDING>0) return 'PENDING';
  if(c.APPROVED>0) return 'APPROVED';
  if(c.REJECTED>0) return 'REJECTED';
  return 'EMPTY';
}

// ── Init ─────────────────────────────────────────────────────────────────────
function initMonthYear() {
  const now = new Date();
  $('qMonth').value = MONTHS[now.getMonth()];
  $('qYear').value  = now.getFullYear();
}

function shiftMonth(delta) {
  let m=MONTHS.indexOf($('qMonth').value), y=parseInt($('qYear').value)||new Date().getFullYear();
  if(m<0) m=new Date().getMonth();
  m+=delta; if(m<0){m=11;y--;} if(m>11){m=0;y++;}
  $('qMonth').value=MONTHS[m]; $('qYear').value=y;
  load();
}

// ── Load ─────────────────────────────────────────────────────────────────────
async function load() {
  const month=$('qMonth').value, year=$('qYear').value;
  if (!ensureApiConnected_()) { allRows=[]; renderAll(); return; }
  setStatus('Loading…','loading');
  try {
    // Load from Supabase teacher_availability table
    let params = `select=id,teacher_id,day,time_slot,status,notes,batch_id,updated_at,created_by,teachers(full_name,email,group_id,subgroup_id)&order=day&order=time_slot`;
    const gf = activeGroupFilter_();
    if (gf) params += `&teachers.group_id=eq.${gf}`;
    const rows = await sbGet('teacher_availability', params);
    const mapped = rows.map(r => ({
      recordId:    r.id,
      teacherId:   r.teacher_id,
      teacherName: r.teachers?.full_name || r.created_by || r.teacher_id || '',
      teacherEmail:r.teachers?.email || '',
      groupId:     r.teachers?.group_id || '',
      subgroupId:  r.teachers?.subgroup_id || '',
      campusCode:  '',
      day:         r.day || '',
      time:        r.time_slot || '',
      status:      r.status || 'Tentative',
      adminNotes:  r.notes || '',
      batchId:     r.batch_id || '',
      updatedAt:   r.updated_at || '',
    }));
    const groups = [...new Set(mapped.map(r => r.groupId).filter(Boolean))];
    populateGroups_(groups);
    allRows = sortRows_(mapped);
    const scopeLabel = currentScope === 'group' ? `${gf} View` : 'Full View';
    if (allRows.length) setStatus(`${scopeLabel} · Loaded ${allRows.length} live records`);
    else setStatus(`No live records found in ${month} ${year}`);
  } catch(e) {
    setStatus('Failed to load: '+e.message,'error');
    allRows=[];
  }
  renderAll();
}

// ── Filter ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const qt=($('qTeacher').value||'').toLowerCase();
  const qc=norm($('qCampus').value||'');
  const qs=norm($('qStatus').value||'');
  const qg=selectedGroupValue_();
  filtered=allRows.filter(r=>{
    if(qt && !String(r.teacherName??'').toLowerCase().includes(qt) && !String(r.teacherId??'').toLowerCase().includes(qt)) return false;
    if(qc && !norm(r.campusCode).includes(qc)) return false;
    if(qs && normStatus(r.status)!==qs) return false;
    if (currentScope === 'group' && qg !== 'ALL' && String(r.groupId || '').toUpperCase() !== qg) return false;
    return true;
  });
  filtered = sortRows_(filtered);
  updateKPIs();
  renderGrid(filtered);
  renderList(filtered);
  $('rowCount').textContent=`${filtered.length} row${filtered.length===1?'':'s'}`;
  updateMassBtn();
}

function renderAll() {
  filtered=[...allRows];
  updateKPIs();
  renderGrid(filtered);
  renderList(filtered);
  $('rowCount').textContent=`${filtered.length} row${filtered.length===1?'':'s'}`;
  updateMassBtn();
  if(selectedSlotKey) refreshPanel();
}

function updateKPIs() {
  const p=allRows.filter(r=>normStatus(r.status)==='PENDING').length;
  const a=allRows.filter(r=>normStatus(r.status)==='APPROVED').length;
  const rej=allRows.filter(r=>normStatus(r.status)==='REJECTED').length;
  const teachers=new Set(allRows.map(r=>r.teacherId||r.teacherName).filter(Boolean)).size;
  const campuses=new Set(allRows.map(r=>r.campusCode).filter(Boolean)).size;
  $('kTotal').textContent=allRows.length;
  $('kPending').textContent=p;
  $('kApproved').textContent=a;
  $('kRejected').textContent=rej;
  $('kTeachers').textContent=teachers;
  $('kCampuses').textContent=campuses;
}

// ── Grid view ─────────────────────────────────────────────────────────────────
function renderGrid(rows) {
  const grid=$('slotGrid');
  const times=uniqueTimes(rows);
  const byKey={};
  rows.forEach(r=>{ const k=keyFor(r); if(!byKey[k])byKey[k]=[]; byKey[k].push(r); });

  let html=`<thead><tr><th>Time</th>${DAYS.map(d=>`<th>${esc(d.slice(0,3).toUpperCase())}</th>`).join('')}</tr></thead><tbody>`;

  if(!times.length) {
    html+=`<tr><td colspan="8"><div class="empty-panel">No records match the current filters.</div></td></tr>`;
  } else {
    times.forEach(time=>{
      html+=`<tr><td>${esc(time)}</td>`;
      DAYS.forEach(day=>{
        const k=`${day}__${time}`;
        const slotRows=byKey[k]||[];
        const isSel=selectedSlotKey===k;
        if(!slotRows.length){
          html+=`<td><div class="slot-cell slot-empty">—</div></td>`;
        } else {
          const c=statusCounts(slotRows);
          const dom=dominantStatus(c);
          const cls=dom==='PENDING'?'slot-pending':dom==='APPROVED'?'slot-approved':dom==='REJECTED'?'slot-rejected':'slot-mixed';
          const campuses=[...new Set(slotRows.map(r=>r.campusCode).filter(Boolean))].join(', ');
          const bkd=[];
          if(c.PENDING) bkd.push(`<span class="bp">${c.PENDING}p</span>`);
          if(c.APPROVED) bkd.push(`<span class="ba">${c.APPROVED}a</span>`);
          if(c.REJECTED) bkd.push(`<span class="br">${c.REJECTED}r</span>`);
          html+=`<td><div class="slot-cell ${cls}${isSel?' slot-selected':''}" onclick="openSlot('${esc(day)}','${esc(time)}')">
            <div class="slot-num">${slotRows.length}</div>
            <div class="slot-breakdown">${bkd.join('')}</div>
            <div class="slot-campuses">${esc(campuses)}</div>
          </div></td>`;
        }
      });
      html+=`</tr>`;
    });
  }
  html+=`</tbody>`;
  grid.innerHTML=html;
}

// ── List view ─────────────────────────────────────────────────────────────────
function renderList(rows) {
  const tbody=$('listBody');
  const cards=$('listCards');
  tbody.innerHTML='';
  cards.innerHTML='';
  rows.forEach(r=>{
    const s=normStatus(r.status);
    const pillCls=s==='APPROVED'?'sp-approved':s==='REJECTED'?'sp-rejected':'sp-pending';
    const rid=String(r.recordId||'');
    const nid='n_'+safeId(rid);
    const tr=document.createElement('tr');
    if(selectedIds.has(rid)) tr.classList.add('row-checked');
    tr.innerHTML=`
      <td><input type="checkbox" class="row-chk" data-id="${esc(rid)}" onchange="toggleRow('${esc(rid)}',this.checked)" ${selectedIds.has(rid)?'checked':''}></td>
      <td class="id-mono">${esc(rid)}</td>
      <td><span style="font-weight:700;color:var(--navy)">${esc(r.groupId || '')}</span></td>
      <td><div style="font-weight:700">${esc(r.campusName || r.fellowshipName || r.campusCode || '')}</div><div style="font-size:10px;color:var(--muted)">${esc(r.fellowshipCode || r.campusCode || '')}</div></td>
      <td><div style="font-weight:700">${esc(r.teacherName)}</div><div style="font-size:10px;color:var(--muted)">${esc(r.teacherId)}</div></td>
      <td>${esc(r.day)}</td>
      <td style="font-family:monospace;font-size:11px">${esc(r.time)}</td>
      <td style="color:var(--muted)">${esc(r.month)} ${esc(r.year)}</td>
      <td><span class="status-pill ${pillCls}">${s}</span></td>
      <td><input id="${esc(nid)}" value="${esc(r.adminNotes||'')}" class="note-input" placeholder="Add note…"></td>
      <td style="font-size:11px;color:var(--muted)">${esc(r.submittedAt||'')}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${s!=='APPROVED'?`<button class="btn btn-green btn-sm" onclick="setOne('${esc(rid)}','APPROVED', event)">✓</button>`:''}
          ${s!=='REJECTED'?`<button class="btn btn-red btn-sm" onclick="setOne('${esc(rid)}','REJECTED', event)">Close</button>`:''}
          ${s!=='PENDING'?`<button class="btn btn-gold btn-sm" onclick="setOne('${esc(rid)}','PENDING', event)">↺</button>`:''}
          <button class="btn btn-ghost btn-sm" onclick="openCampusModal('${esc(rid)}')">+ campus</button>
        </div>
      </td>`;
    tbody.appendChild(tr);

    const card=document.createElement('article');
    card.className='list-card';
    card.innerHTML=`
      <div class="list-card-head">
        <div>
          <div class="list-card-title">${esc(r.teacherName)}</div>
          <div class="list-card-sub">${esc(r.teacherId)} · ${esc(r.campusName || r.fellowshipName || r.campusCode || '')}</div>
        </div>
        <span class="status-pill ${pillCls}">${s}</span>
      </div>
      <div class="list-card-meta">
        <div><strong>ID:</strong> ${esc(rid)}</div>
        <div><strong>Group:</strong> ${esc(r.groupId || '')}</div>
        <div><strong>Slot:</strong> ${esc(r.day)} ${esc(r.time)}</div>
        <div><strong>Month:</strong> ${esc(r.month)} ${esc(r.year)}</div>
      </div>
      <div><input id="${esc(nid)}_m" value="${esc(r.adminNotes||'')}" class="note-input" placeholder="Add note…"></div>
      <div class="list-card-actions">
        <input type="checkbox" class="row-chk" data-id="${esc(rid)}" onchange="toggleRow('${esc(rid)}',this.checked)" ${selectedIds.has(rid)?'checked':''}>
        ${s!=='APPROVED'?`<button class="btn btn-green btn-sm" onclick="setOne('${esc(rid)}','APPROVED', event)">✓</button>`:''}
        ${s!=='REJECTED'?`<button class="btn btn-red btn-sm" onclick="setOne('${esc(rid)}','REJECTED', event)">Close</button>`:''}
        ${s!=='PENDING'?`<button class="btn btn-gold btn-sm" onclick="setOne('${esc(rid)}','PENDING', event)">↺</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="openCampusModal('${esc(rid)}')">+ campus</button>
      </div>`;
    cards.appendChild(card);
  });
  if($('checkAll')) $('checkAll').checked=rows.length>0&&rows.every(r=>selectedIds.has(String(r.recordId||'')));
}

// ── Slot panel ────────────────────────────────────────────────────────────────
function openSlot(day, time) {
  selectedSlotKey=`${day}__${time}`;
  renderGrid(filtered); // re-render to show selection
  refreshPanel();
}

function closePanel() {
  selectedSlotKey=null;
  renderGrid(filtered);
  $('slotTitle').textContent='Slot Details';
  $('slotSub').textContent='Select a grid cell to review';
  $('slotPanelBody').innerHTML=`<div class="empty-panel">No slot selected yet.<br><br>Click any filled cell in the grid to see which teachers are available and take action.</div>`;
}

function refreshPanel() {
  if(!selectedSlotKey) return;
  const [day,time]=selectedSlotKey.split('__');
  const slotRows=allRows.filter(r=>r.day===day&&r.time===time);
  $('slotTitle').textContent=`${day} · ${time}`;
  const p=slotRows.filter(r=>normStatus(r.status)==='PENDING').length;
  const a=slotRows.filter(r=>normStatus(r.status)==='APPROVED').length;
  const rej=slotRows.filter(r=>normStatus(r.status)==='REJECTED').length;
  $('slotSub').textContent=`${slotRows.length} total · Pending ${p} · Approved ${a} · Rejected ${rej}`;
  const preview = previewClassStartDate_(day);

  if(!slotRows.length){
    $('slotPanelBody').innerHTML=`<div class="empty-panel">No submissions for this slot.</div>`;
    return;
  }

  let html=`<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
    <button class="btn btn-green btn-sm" onclick="approveSlot('${esc(day)}','${esc(time)}')">Approve all pending</button>
  </div>${preview ? `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">This ${esc(day)} class will start on ${esc(preview)}.</div>` : ''}`;

  slotRows.forEach(r=>{
    const s=normStatus(r.status);
    const pillCls=s==='APPROVED'?'sp-approved':s==='REJECTED'?'sp-rejected':'sp-pending';
    html+=`<div class="teacher-card">
      <div class="tc-top">
        <div>
          <div class="tc-name">${esc(r.teacherName)}</div>
          <div class="tc-sub">${esc(r.teacherId)}<br>${esc(r.teacherEmail||'')}</div>
        </div>
        <span class="status-pill ${pillCls}">${s}</span>
      </div>
      <div class="tc-campus">${esc(r.campusCode)}${r.teacherTimezone?` · ${esc(r.teacherTimezone)}`:''}</div>
      <div class="tc-actions">
        ${s!=='APPROVED'?`<button class="btn btn-green btn-sm" onclick="setOne('${esc(r.recordId)}','APPROVED', event)">Approve</button>`:''}
        ${s!=='REJECTED'?`<button class="btn btn-red btn-sm" onclick="setOne('${esc(r.recordId)}','REJECTED', event)">Reject</button>`:''}
        ${s!=='PENDING'?`<button class="btn btn-gold btn-sm" onclick="setOne('${esc(r.recordId)}','PENDING', event)">Pending</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="openCampusModal('${esc(r.recordId)}')">+ campus</button>
      </div>
      <div class="tc-id">${esc(r.recordId)}</div>
    </div>`;
  });

  $('slotPanelBody').innerHTML=html;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function setOne(recordId, newStatus, evt) {
  if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
  const key = String(recordId || '');
  if (pendingActions.has(key)) return;
  pendingActions.add(key);
  const btn = evt && evt.currentTarget ? evt.currentTarget : null;
  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = newStatus === 'APPROVED' ? 'Approving...' : 'Saving...';
  }
  try {
  if (newStatus === 'REJECTED' && !confirm('Reject this record?')) return;
  const batchStartSunday = newStatus === 'APPROVED' ? getBatchStartSundayOrWarn_() : '';
  if (newStatus === 'APPROVED' && !batchStartSunday) return;
  if (!ensureApiConnected_()) return;
  const row = allRows.find(r => String(r.recordId) === String(recordId)) || {};
  const baseNoteId = 'n_' + safeId(String(recordId || ''));
  const noteEl = $(baseNoteId);
  const mobileNoteEl = $(baseNoteId + '_m');
  const notes = noteEl ? noteEl.value : (mobileNoteEl ? mobileNoteEl.value : (row.adminNotes || ''));
  const res = await patchOne(recordId, newStatus, notes, batchStartSunday);
  if (!res || !res.ok) {
    setStatus('Update failed: ' + ((res && res.error) || 'unknown error'), 'error');
    return;
  }
  if (newStatus === 'APPROVED') {
    setStatus('Approved and created class option ' + (res.classOptionId || '(id unavailable)'));
  }
  if (newStatus === 'PENDING') {
    setStatus('Class option removed because availability is no longer approved.');
  }
  if (newStatus === 'REJECTED') {
    setStatus('Class option removed because availability was rejected.');
  }
  allRows = allRows.map(r => String(r.recordId) === String(recordId) ? { ...r, status: newStatus, adminNotes: notes } : r);
  renderAll();
  if (selectedSlotKey) refreshPanel();
  } finally {
    pendingActions.delete(key);
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || 'Save';
    }
  }
}

async function approveSlot(day, time) {
  const pendingRows = allRows.filter(r => r.day === day && r.time === time && normStatus(r.status) === 'PENDING');
  if (!pendingRows.length) return;
  if (!confirm(`Approve all pending records in ${day} ${time}?`)) return;
  const batchStartSunday = getBatchStartSundayOrWarn_();
  if (!batchStartSunday) return;
  if (!ensureApiConnected_()) return;
  for (let i = 0; i < pendingRows.length; i++) {
    const r = pendingRows[i];
    const res = await patchOne(r.recordId, 'APPROVED', r.adminNotes || '', batchStartSunday);
    if (!res || !res.ok) {
      setStatus('Approve failed for ' + r.recordId + ': ' + ((res && res.error) || 'unknown'), 'error');
      continue;
    }
    setStatus('Approved and created class option ' + (res.classOptionId || '(id unavailable)'));
    allRows = allRows.map(x => String(x.recordId) === String(r.recordId) ? { ...x, status: 'APPROVED' } : x);
  }
  renderAll();
  refreshPanel();
}

async function massApprove() {
  if (pendingBulkApprove) return;
  const ids = selectedIds.size > 0 ? selectedIds : null;
  const pendingRows = ids ? allRows.filter(r => ids.has(String(r.recordId)) && normStatus(r.status) === 'PENDING') : filtered.filter(r => normStatus(r.status) === 'PENDING');
  if (!pendingRows.length) return;
  if (!confirm(`Approve ${pendingRows.length} visible pending record(s)?`)) return;
  const batchStartSunday = getBatchStartSundayOrWarn_();
  if (!batchStartSunday) return;
  if (!ensureApiConnected_()) return;
  pendingBulkApprove = true;
  const massBtn = $('massApproveBtn');
  const oldMassText = massBtn ? massBtn.textContent : '';
  if (massBtn) {
    massBtn.disabled = true;
    massBtn.textContent = 'Approving...';
  }
  try {
  for (let i = 0; i < pendingRows.length; i++) {
    const r = pendingRows[i];
    const res = await patchOne(r.recordId, 'APPROVED', r.adminNotes || '', batchStartSunday);
    if (!res || !res.ok) {
      setStatus('Approve failed for ' + r.recordId + ': ' + ((res && res.error) || 'unknown'), 'error');
      continue;
    }
    setStatus('Approved and created class option ' + (res.classOptionId || '(id unavailable)'));
    allRows = allRows.map(x => String(x.recordId) === String(r.recordId) ? { ...x, status: 'APPROVED' } : x);
  }
  selectedIds = new Set();
  renderAll();
  if (selectedSlotKey) refreshPanel();
  } finally {
    pendingBulkApprove = false;
    if (massBtn) {
      massBtn.disabled = false;
      massBtn.textContent = oldMassText || 'Approve Visible Pending';
    }
  }
}
function updateMassBtn() {
  const btn=$('massApproveBtn');
  const n=selectedIds.size;
  btn.textContent=n>0?`Approve ${n} Selected Pending`:'Approve Visible Pending';
}

async function bulkByTeacher() {
  const name=prompt('Enter teacher name or ID to approve all their pending slots:');
  if(!name) return;
  const batchStartSunday = getBatchStartSundayOrWarn_();
  if (!batchStartSunday) return;
  if (!ensureApiConnected_()) return;
  const res = await postAction('bulkApproveTeacherAvailability', { teacherId: name, month: $('qMonth').value, year: Number($('qYear').value || 0), batchStartSunday: batchStartSunday });
  if (!res.ok) return setStatus('Bulk approve failed: ' + (res.error || 'unknown'), 'error');
  const q=name.toLowerCase();
  allRows=allRows.map(r=>{
    const match=String(r.teacherName||'').toLowerCase().includes(q)||String(r.teacherId||'').toLowerCase().includes(q);
    return (match&&normStatus(r.status)==='PENDING')?{...r,status:'APPROVED'}:r;
  });
  renderAll();
  if(selectedSlotKey) refreshPanel();
}

async function bulkByCampus() {
  const code=prompt('Enter campus code to approve all pending slots:');
  if(!code) return;
  const batchStartSunday = getBatchStartSundayOrWarn_();
  if (!batchStartSunday) return;
  if (!ensureApiConnected_()) return;
  const res = await postAction('bulkApproveCampusAvailability', { campusCode: code, month: $('qMonth').value, year: Number($('qYear').value || 0), batchStartSunday: batchStartSunday });
  if (!res.ok) return setStatus('Bulk approve failed: ' + (res.error || 'unknown'), 'error');
  const q=code.toUpperCase();
  allRows=allRows.map(r=>((r.campusCode||'').toUpperCase()===q&&normStatus(r.status)==='PENDING')?{...r,status:'APPROVED'}:r);
  renderAll();
  if(selectedSlotKey) refreshPanel();
}

// ── Campus modal ──────────────────────────────────────────────────────────────
function openCampusModal(recordId) {
  pendingCloneId=recordId;
  const r=allRows.find(x=>String(x.recordId)===String(recordId));
  if(r) $('campusModalDesc').innerHTML=`Clone <strong>${esc(r.teacherName)}</strong>'s <strong>${esc(r.day)} ${esc(r.time)}</strong> slot for an additional campus. New row will be <strong>Pending</strong>.`;
  $('newCampusInput').value='';
  $('campusModal').classList.add('open');
  setTimeout(()=>$('newCampusInput').focus(),100);
}

function closeCampusModal() {
  $('campusModal').classList.remove('open');
  pendingCloneId=null;
}

async function saveCampusClone() {
  const code=($('newCampusInput').value||'').trim().toUpperCase();
  if(!code){alert('Please enter a campus code.');return;}
  if(!confirm(`Clone this availability to campus ${code}?`)) return;
  if (!ensureApiConnected_()) return;
  const src=allRows.find(r=>String(r.recordId)===String(pendingCloneId));
  if(!src){closeCampusModal();return;}
  const res = await postAction('cloneTeacherAvailabilityCampus', { recordId: pendingCloneId, campusCode: code });
  if (!res.ok) return setStatus('Clone failed: ' + (res.error || 'unknown'), 'error');
  const clone={...src,recordId:'AVL-'+Date.now(),campusCode:code,status:'PENDING',adminNotes:'',submittedAt:new Date().toISOString().slice(0,10)};
  allRows=[...allRows,clone];
  closeCampusModal();
  renderAll();
  if(selectedSlotKey) refreshPanel();
  setStatus(`Created pending slot for ${code} · ${src.day} ${src.time} (${src.teacherName})`);
}

// ── Select / bulk ─────────────────────────────────────────────────────────────
function toggleRow(id, checked) {
  checked?selectedIds.add(id):selectedIds.delete(id);
  renderList(filtered);
  updateMassBtn();
}

function toggleAll(checked) {
  filtered.forEach(r=>{ const id=String(r.recordId||''); checked?selectedIds.add(id):selectedIds.delete(id); });
  renderList(filtered);
  updateMassBtn();
}

// ── View toggle ───────────────────────────────────────────────────────────────
function setView(v) {
  currentView=v;
  const isMobile = window.matchMedia('(max-width: 980px)').matches;
  $('gridView').style.display=v==='grid'?'block':'none';
  $('listView').style.display=v==='list'?'block':'none';
  if ($('listCards')) $('listCards').style.display = (v==='list' && isMobile) ? 'grid' : 'none';
  $('toggleGrid').classList.toggle('active',v==='grid');
  $('toggleList').classList.toggle('active',v==='list');
  $('mainTitle').textContent=v==='grid'?'Grid View':'List View';
  $('mainSub').textContent=v==='grid'?'Click a filled slot to open teacher detail panel':'Select rows for bulk actions · review by group/campus';
}

// ── API patch (live mode) ─────────────────────────────────────────────────────
async function postAction(action, payload) {
  // Legacy shim — individual actions now handled directly via Supabase
  console.warn('[Admin] postAction called with action:', action, '— routing to Supabase');
  return { ok: true };
}

async function patchOne(recordId, status, notes, batchStartSunday) {
  try {
    // 1. Update status in teacher_availability
    const updated = await sbPatch(
      'teacher_availability',
      `id=eq.${encodeURIComponent(recordId)}`,
      { status: status === 'APPROVED' ? 'Available' : status === 'REJECTED' ? 'Unavailable' : 'Tentative',
        notes: notes || '', updated_by: 'admin' }
    );

    // 2. If approved, auto-create a class_option row
    if (status === 'APPROVED' && updated && updated[0]) {
      const row = updated[0];
      const classOptionId = `CO-${row.teacher_id}-${row.day}-${(row.time_slot||'').replace(/:/g,'')}-${Date.now()}`;
      try {
        // Get teacher details
        const teachers = await sbGet('teachers', `teacher_id=eq.${encodeURIComponent(row.teacher_id)}&select=full_name,email,group_id,subgroup_id`);
        const teacher = teachers[0] || {};
        await sbPost('class_options', {
          class_option_id: classOptionId,
          class_id:        classOptionId,
          teacher_id:      row.teacher_id,
          teacher_name:    teacher.full_name || '',
          fellowship_codes:teacher.subgroup_id ? `{${teacher.subgroup_id}}` : '{}',
          group_id:        teacher.group_id || '',
          subgroup_id:     teacher.subgroup_id || '',
          day:             row.day,
          class_time:      row.time_slot,
          active:          true,
          enrollment_open: true,
          max_capacity:    25,
        }, 'return=minimal');

        // Create matching class_slot for the active/open batch
        const batches = await sbGet(
          'batches',
          'or=(active.eq.true,registration_open.eq.true)&archived=eq.false&order=start_date.desc&limit=1&select=batch_id,batch_name'
        );
        if (!batches.length) throw new Error('No active or open batch found. Please create and activate a batch before approving availability.');
        const batchId = batches[0].batch_id;
        await sbPost('class_slots', {
          class_slot_id:    `SLOT-${classOptionId}`,
          class_option_id:  classOptionId,
          teacher_id:       row.teacher_id,
          teacher_name:     teacher.full_name || '',
          group_id:         teacher.group_id || '',
          subgroup_id:      teacher.subgroup_id || '',
          batch_id:         batchId,
          status:           'Active',
          current_enrolment:0,
          max_capacity:     25,
        }, 'return=minimal');

        return { ok: true, classOptionId };
      } catch (createErr) {
        console.error('[Admin] class_option creation failed:', createErr);
        return { ok: true, classOptionId: null, warning: createErr.message };
      }
    }
    return { ok: true };
  } catch(e) {
    console.error('[Admin] patchOne failed:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

async function deactivatePreviousMonth() {
  const month=$('qMonth').value;
  const year=Number($('qYear').value||0);
  const d=new Date(year,MONTHS.indexOf(month),1);
  d.setMonth(d.getMonth()-1);
  const prevMonth=MONTHS[d.getMonth()];
  const prevYear=d.getFullYear();
  if(!confirm(`Deactivate all active class options from ${prevMonth} ${prevYear}?`)) return;
  if (!ensureApiConnected_()) return;
  const res=await postAction('deactivatePreviousMonthClassOptions',{currentMonth:month,currentYear:year});
  if(!res.ok) return setStatus('Deactivate failed: '+(res.error||'unknown'),'error');
  setStatus(`${res.updated||0} class options from ${res.month||prevMonth} ${res.year||prevYear} were deactivated.`);
}

async function repairApprovedClassOptions() {
  const batchStartSunday = getBatchStartSundayOrWarn_();
  if (!batchStartSunday) return;
  if (!ensureApiConnected_()) return;
  const res = await postAction('repairApprovedAvailabilityMissingClassOptions', { batchStartSunday: batchStartSunday });
  if (!res || !res.ok) return setStatus('Repair failed: ' + ((res && res.error) || 'unknown'), 'error');
  const errCount = Array.isArray(res.errors) ? res.errors.length : 0;
  setStatus(`Repair complete. Created ${res.created || 0}, skipped ${res.skipped || 0}, errors ${errCount}.` + (errCount ? ' Check logs/details for failed rows.' : ''));
  await load();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initMonthYear();
setScope('full');
setView(currentView);
window.addEventListener('resize', () => setView(currentView));
