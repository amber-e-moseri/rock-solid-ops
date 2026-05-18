import { CONFIG, supabase } from "../auth/auth-client.js";
import { requireAuth } from "../auth/auth-client.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[c]));
const fmt = (v) => v ? new Date(v).toLocaleString() : "-";
const ymd = (v) => v ? new Date(v).toISOString().slice(0, 10) : "";
const milestoneKeys = ["born_again", "filled_with_the_spirit", "partnership", "joined_cell", "serving_team_interest", "needs_follow_up", "foundation_completed"];
const milestoneLabels = {
  born_again: "Born Again",
  filled_with_the_spirit: "Filled with the Spirit",
  partnership: "Partnership",
  joined_cell: "Joined Cell",
  serving_team_interest: "Serving Team Interest",
  needs_follow_up: "Needs Follow-up",
  foundation_completed: "Foundation Completed"
};
const state = {
  auth: null,
  applicants: [],
  classOptions: [],
  batches: [],
  notifications: [],
  emails: [],
  audits: [],
  moodle: [],
  attendance: [],
  filters: { search: "", fellowship: "", classOption: "", batch: "", assignment: "", notif: "", milestone: "", attendance: "", status: "", date: "" },
  advFilters: { dateFrom: "", dateTo: "", moodle: "", attStatus: "", active: false },
  selectedApplicantId: null,
  latestViewedApplicantId: null,
  selectedIds: new Set(),
};
function showFlash(msg, type = "success") {
  const klass = type === "error" ? "err" : type === "warn" ? "warn" : "success";
  $("flashArea").innerHTML = `<div class="${klass}">${esc(msg)}</div>`;
  setTimeout(() => { if ($("flashArea")) $("flashArea").innerHTML = ""; }, 4200);
}
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", "light");
  localStorage.setItem("fs_theme", "light");
}
function initTheme() {
  setTheme("light");
}
function statusPill(status) {
  const normalized = String(status || "PENDING").toUpperCase();
  const map = { SENT: "completed", PENDING: "attention", FAILED: "duplicate", RETRIED: "assigned" };
  const cls = map[normalized] || "unassigned";
  return `<span class="pill ${cls}">${esc(normalized)}</span>`;
}
function getApplicantMilestones(app) { return milestoneKeys.filter((k) => Boolean(app[k])); }
function getAttendanceRows(app) {
  const byId = String(app.id || "");
  const byEmail = String(app.email || "").toLowerCase();
  return state.attendance.filter((r) => {
    const rid = String(r.applicant_id || r.student_id || r.registration_id || "");
    const remail = String(r.email || r.student_email || "").toLowerCase();
    return (byId && rid && byId === rid) || (byEmail && remail && byEmail === remail);
  });
}
function getAttendanceSummary(app) {
  const rows = getAttendanceRows(app);
  if (!rows.length) return { pct: null, attended: 0, total: 0, last: null, missing: 0 };
  const attended = rows.filter((r) => r.present === true || String(r.present).toLowerCase() === "yes" || String(r.status).toLowerCase() === "present").length;
  const total = rows.length;
  const pct = total ? Math.round((attended / total) * 100) : 0;
  const last = rows.map((r) => r.created_at || r.date || r.session_date).filter(Boolean).sort().at(-1) || null;
  return { pct, attended, total, last, missing: Math.max(0, total - attended) };
}
function getNotificationRows(app) {
  const byId = String(app.id || "");
  const byEmail = String(app.email || "").toLowerCase();
  return state.notifications.filter((n) => {
    const nid = String(n.applicant_id || n.student_id || "");
    const nemail = String(n.recipient_email || n.email || "").toLowerCase();
    return (byId && nid && byId === nid) || (byEmail && nemail && byEmail === nemail);
  });
}
function getNotificationState(app) {
  const rows = getNotificationRows(app);
  if (!rows.length) return "PENDING";
  const order = ["FAILED", "RETRIED", "PENDING", "SENT"];
  const normalized = rows.map((r) => String(r.status || r.event_status || r.provider_status || "PENDING").toUpperCase());
  return order.find((stateName) => normalized.includes(stateName)) || normalized[0] || "PENDING";
}
function getLatestActivity(app) {
  const dates = [];
  if (app.updated_at) dates.push(app.updated_at);
  if (app.created_at) dates.push(app.created_at);
  const notif = getNotificationRows(app)[0];
  if (notif?.created_at) dates.push(notif.created_at);
  const att = getAttendanceRows(app)[0];
  if (att?.created_at || att?.date) dates.push(att.created_at || att.date);
  return dates.filter(Boolean).sort().at(-1) || null;
}
function summarizeApplicant(app) {
  const milestones = getApplicantMilestones(app);
  const attendance = getAttendanceSummary(app);
  const notifState = getNotificationState(app);
  const completed = Boolean(app.foundation_completed) || milestones.length >= milestoneKeys.length;
  const needsFollowUp = Boolean(app.needs_follow_up || app.needs_admin_review);
  const duplicate = Number(app.duplicate_count || 0) > 1;
  return { milestoneCount: milestones.length, attendancePct: attendance.pct, notificationState: notifState, completed, needsFollowUp, duplicate, lastActivity: getLatestActivity(app) };
}
function classifyRowStatus(app, summary) {
  if (summary.duplicate) return { label: "Duplicate", cls: "duplicate" };
  if (summary.needsFollowUp) return { label: "Needs Attention", cls: "attention" };
  if (summary.completed) return { label: "Completed", cls: "completed" };
  if (app.class_option_id) return { label: "Assigned", cls: "assigned" };
  return { label: "Unassigned", cls: "unassigned" };
}
function classIdOf(row) { return String(row?.class_option_id || row?.id || ""); }
function getClassInfo(classOptionId) {
  return state.classOptions.find((c) => classIdOf(c) === String(classOptionId || "")) || null;
}
function classCapacityInfo(classOptionId) {
  const cls = getClassInfo(classOptionId);
  const applicantsInClass = state.applicants.filter((a) => String(a.class_option_id || "") === String(classOptionId || "")).length;
  const max = Number(cls?.capacity || cls?.max_capacity || cls?.class_capacity || 0) || 0;
  return { current: applicantsInClass, max, full: max > 0 && applicantsInClass >= max };
}
function buildFilterOptions() {
  const fellowships = [...new Set(state.applicants.map((a) => a.fellowship_code || a.fellowship || a.subgroup_id).filter(Boolean))].sort();
  $("fellowshipFilter").innerHTML = `<option value="">All Fellowships</option>${fellowships.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}`;
  const classes = state.classOptions.map((c) => classIdOf(c)).filter(Boolean).sort((a, b) => a.localeCompare(b));
  $("classFilter").innerHTML = `<option value="">All Classes</option>${classes.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}`;
  const batches = [...new Set(state.applicants.map((a) => a.batch_id).concat(state.classOptions.map((c) => c.batch_id)).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  $("batchFilter").innerHTML = `<option value="">All Batches</option>${batches.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}`;
  $("milestoneFilter").innerHTML = `<option value="">All Milestones</option>${Object.entries(milestoneLabels).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join("")}`;
  $("statusFilter").innerHTML = `<option value="">All Status</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option><option value="attention">Needs Attention</option><option value="duplicate">Duplicate</option><option value="completed">Completed</option>`;
}
function filteredApplicants() {
  const f = state.filters;
  return state.applicants.filter((app) => {
    const summary = summarizeApplicant(app);
    const fellowship = String(app.fellowship_code || app.fellowship || app.subgroup_id || "");
    const batch = String(app.batch_id || getClassInfo(app.class_option_id)?.batch_id || "");
    const q = f.search.trim().toLowerCase();
    if (q) {
      const pool = [app.full_name, app.email, app.phone, app.phone_number].map((v) => String(v || "").toLowerCase()).join(" ");
      if (!pool.includes(q)) return false;
    }
    if (f.fellowship && fellowship !== f.fellowship) return false;
    if (f.classOption && String(app.class_option_id || "") !== String(f.classOption)) return false;
    if (f.batch && batch !== String(f.batch)) return false;
    if (f.assignment === "assigned" && !app.class_option_id) return false;
    if (f.assignment === "unassigned" && app.class_option_id) return false;
    if (f.notif && summary.notificationState !== f.notif) return false;
    if (f.milestone && !Boolean(app[f.milestone])) return false;
    if (f.attendance === "high" && (summary.attendancePct == null || summary.attendancePct < 75)) return false;
    if (f.attendance === "low" && (summary.attendancePct == null || summary.attendancePct >= 75)) return false;
    if (f.attendance === "none" && summary.attendancePct != null) return false;
    if (f.status) {
      const rowStatus = classifyRowStatus(app, summary).cls;
      if (rowStatus !== f.status) return false;
    }
    if (f.date && ymd(app.created_at) !== f.date) return false;
    // Advanced filters
    const af = state.advFilters;
    if (af.active) {
      if (af.dateFrom && ymd(app.created_at) < af.dateFrom) return false;
      if (af.dateTo   && ymd(app.created_at) > af.dateTo)   return false;
      if (af.moodle) {
        const mr = state.moodle.find((m) =>
          String(m.applicant_id || m.student_id || "") === String(app.id) ||
          String(m.email || "").toLowerCase() === String(app.email || "").toLowerCase()
        );
        if (af.moodle === "yes"    && !mr) return false;
        if (af.moodle === "no"     && mr)  return false;
        if (af.moodle === "synced" && (!mr || String(mr.sync_status || "").toUpperCase() !== "SYNCED")) return false;
        if (af.moodle === "failed" && (!mr || String(mr.sync_status || "").toUpperCase() !== "FAILED")) return false;
      }
      if (af.attStatus) {
        const att = getAttendanceSummary(app);
        if (af.attStatus === "never"  && att.total > 0) return false;
        if (af.attStatus === "active" && (att.pct == null || att.pct < 75)) return false;
        if (af.attStatus === "atrisk" && (att.pct == null || att.pct >= 75)) return false;
      }
    }
    return true;
  });
}
function renderKpis(rows) {
  const total = rows.length;
  const assigned = rows.filter((a) => Boolean(a.class_option_id)).length;
  const unassigned = rows.filter((a) => !a.class_option_id).length;
  const duplicates = rows.filter((a) => Number(a.duplicate_count || 0) > 1).length;
  const needsAttention = rows.filter((a) => summarizeApplicant(a).needsFollowUp).length;
  const classCapacityAlerts = state.classOptions.filter((c) => {
    const id = classIdOf(c);
    if (!id) return false;
    const cap = classCapacityInfo(id);
    return cap.max > 0 && cap.current >= cap.max;
  }).length;
  const items = [
    ["Total Registrants", total, "All visible records"],
    ["Assigned Students", assigned, `${total ? Math.round((assigned / total) * 100) : 0}% assigned`],
    ["Unassigned Students", unassigned, "Need class placement"],
    ["Duplicates", duplicates, "Potential data merge review"],
    ["Needs Attention", needsAttention, "Follow-up required"],
    ["Class Capacity Alerts", classCapacityAlerts, "Classes at or above capacity"]
  ];
  $("kpiGrid").innerHTML = items.map(([label, value, sub]) => `
    <article class="card">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${esc(value)}</div>
      <div class="kpi-sub">${esc(sub)}</div>
    </article>
  `).join("");
}
function renderTable(rows) {
  const classMap = new Map(state.classOptions.map((c) => [classIdOf(c), c]));
  const tableRows = rows.map((app) => {
    const summary = summarizeApplicant(app);
    const cls = classMap.get(String(app.class_option_id || ""));
    const rowStatus = classifyRowStatus(app, summary);
    const milestonePct = Math.round((summary.milestoneCount / milestoneKeys.length) * 100);
    const checked = state.selectedIds.has(String(app.id)) ? "checked" : "";
    return `<tr>
      <td style="width:32px;padding:8px"><input type="checkbox" class="row-chk" data-id="${esc(app.id)}" ${checked} style="cursor:pointer;width:16px;height:16px" /></td>
      <td class="student-cell"><div class="name">${esc(app.full_name || "-")}</div><div class="sub">${esc(app.email || "-")} · ${esc(app.phone || app.phone_number || "-")}</div></td>
      <td>${esc(app.fellowship_code || app.fellowship || app.subgroup_id || "-")}</td>
      <td>${esc(app.class_option_id || "-")}</td>
      <td>${esc(cls?.teacher_name || cls?.teacher_id || "-")}</td>
      <td>${esc(app.batch_id || cls?.batch_id || "-")}</td>
      <td>${milestonePct}%</td>
      <td>${summary.attendancePct == null ? "-" : `${summary.attendancePct}%`}</td>
      <td>${statusPill(summary.notificationState)}</td>
      <td>${esc(fmt(summary.lastActivity))}</td>
      <td><span class="pill ${rowStatus.cls}">${esc(rowStatus.label)}</span></td>
      <td><div class="btns"><button class="btn" data-open="${esc(app.id)}">Open</button><button class="btn" data-correct="${esc(app.id)}">Correct</button></div></td>
    </tr>`;
  }).join("");
  $("tableWrap").innerHTML = `<table><thead><tr>
    <th style="width:32px"><input type="checkbox" id="selectAllChk" style="cursor:pointer;width:16px;height:16px" /></th>
    <th>Student</th><th>Fellowship</th><th>Assigned Class</th><th>Teacher</th><th>Batch</th>
    <th>Milestone Progress</th><th>Attendance %</th><th>Notification State</th><th>Last Activity</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>${tableRows || `<tr><td colspan="12" class="muted">No registrants match the current filters.</td></tr>`}</tbody></table>`;
  $("mobileCards").innerHTML = rows.map((app) => {
    const summary = summarizeApplicant(app);
    const rowStatus = classifyRowStatus(app, summary);
    return `<article class="mobile-card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><div style="font-weight:800">${esc(app.full_name || "-")}</div><div class="muted" style="font-size:12px">${esc(app.email || "-")}</div></div><span class="pill ${rowStatus.cls}">${esc(rowStatus.label)}</span></div>
      <div style="margin-top:8px;font-size:12px" class="muted">${esc(app.class_option_id || "No class assigned")} · Attendance ${summary.attendancePct == null ? "-" : `${summary.attendancePct}%`}</div>
      <div style="margin-top:6px">${statusPill(summary.notificationState)}</div>
      <div class="btns" style="margin-top:10px"><button class="btn" data-open="${esc(app.id)}">Open</button><button class="btn" data-correct="${esc(app.id)}">Correct</button></div>
    </article>`;
  }).join("") || `<div class="muted">No registrants match the current filters.</div>`;
  document.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => openDrawer(btn.getAttribute("data-open"))));
  document.querySelectorAll("[data-correct]").forEach((btn) => btn.addEventListener("click", () => openCorrectionModal(btn.getAttribute("data-correct"))));
}
function updateBulkBar() {
  const bar = $("bulkBar");
  if (!bar) return;
  const count = state.selectedIds.size;
  bar.style.display = count ? "flex" : "none";
  $("bulkCount").textContent = `${count} selected`;
  // Populate class options for bulk class change
  const sel = $("bulkClassSelect");
  if (sel && sel.options.length <= 1) {
    state.classOptions.filter((c) => c.active !== false).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = classIdOf(c);
      opt.textContent = `${classIdOf(c)} · ${c.teacher_name || ""} · ${c.day || ""} ${c.class_time || ""}`.trim();
      sel.appendChild(opt);
    });
  }
}

async function executeBulkStatus(newStatus) {
  if (!newStatus || !state.selectedIds.size) return;
  const ids = [...state.selectedIds];
  const now = new Date().toISOString();
  const bulkOpId = crypto.randomUUID();
  let done = 0;
  const prog = $("bulkProgress");
  prog.style.display = "inline";
  for (const id of ids) {
    const app = state.applicants.find((a) => String(a.id) === id);
    if (!app) continue;
    const { error } = await supabase.from("applicants")
      .update({ status: newStatus, registration_status: newStatus, updated_at: now })
      .eq("id", id);
    if (!error) {
      await supabase.from("audit_logs").insert({
        action: "BULK_STATUS_CHANGE", entity_type: "applicant", entity_id: id,
        actor_email: state.auth?.profile?.email || null, status: "SUCCESS",
        details: { old_status: app.status || app.registration_status, new_status: newStatus, bulk_operation_id: bulkOpId },
        created_at: now,
      });
    }
    done++;
    prog.textContent = `${done}/${ids.length}…`;
  }
  prog.style.display = "none";
  state.selectedIds.clear();
  $("bulkStatusSelect").value = "";
  await loadData();
  showFlash(`Bulk status updated to ${newStatus} for ${done} applicants.`);
}

async function executeBulkClass(newClassId) {
  if (!newClassId || !state.selectedIds.size) return;
  const cls = getClassInfo(newClassId);
  if (!cls) return;
  const ids = [...state.selectedIds];
  const now = new Date().toISOString();
  const bulkOpId = crypto.randomUUID();
  let done = 0;
  const prog = $("bulkProgress");
  prog.style.display = "inline";
  for (const id of ids) {
    const app = state.applicants.find((a) => String(a.id) === id);
    if (!app) continue;
    const patch = { class_option_id: newClassId, registration_status: "ASSIGNED", assigned_at: now, updated_at: now };
    if (cls.batch_id) patch.batch_id = cls.batch_id;
    const { error } = await supabase.from("applicants").update(patch).eq("id", id);
    if (!error) {
      await supabase.from("moodle_enrollment_sync")
        .update({ class_option_id: newClassId, sync_status: "PENDING", updated_at: now })
        .eq("applicant_id", id);
      await supabase.from("audit_logs").insert({
        action: "BULK_CLASS_REASSIGNMENT", entity_type: "applicant", entity_id: id,
        actor_email: state.auth?.profile?.email || null, status: "SUCCESS",
        details: { old_class: app.class_option_id, new_class: newClassId, bulk_operation_id: bulkOpId },
        created_at: now,
      });
    }
    done++;
    prog.textContent = `${done}/${ids.length}…`;
  }
  prog.style.display = "none";
  state.selectedIds.clear();
  $("bulkClassSelect").value = "";
  await loadData();
  showFlash(`Bulk class change to ${newClassId} for ${done} applicants.`);
}

function exportCsv() {
  const ids = state.selectedIds.size > 0 ? state.selectedIds : null;
  const rows = ids
    ? state.applicants.filter((a) => ids.has(String(a.id)))
    : filteredApplicants();
  const cols = ["full_name","email","phone","fellowship_code","class_option_id","batch_id","status","registration_status","created_at"];
  const header = cols.join(",");
  const lines = rows.map((a) => cols.map((c) => `"${String(a[c] ?? "").replace(/"/g, '""')}"`).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `applicants-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function updateAdvFilterBadge() {
  const af = state.advFilters;
  const count = [af.dateFrom, af.dateTo, af.moodle, af.attStatus].filter(Boolean).length;
  const badge = $("advFilterBadge");
  if (!badge) return;
  badge.style.display = count ? "inline" : "none";
  badge.textContent = String(count);
}

function saveFilterPreset() {
  const name = prompt("Preset name:");
  if (!name) return;
  const presets = JSON.parse(localStorage.getItem("fs_adv_filter_presets") || "{}");
  presets[name] = { ...state.filters, ...state.advFilters };
  localStorage.setItem("fs_adv_filter_presets", JSON.stringify(presets));
  loadPresetOptions();
  showFlash(`Preset "${name}" saved.`);
}

function loadPresetOptions() {
  const sel = $("afPresetSelect");
  if (!sel) return;
  const presets = JSON.parse(localStorage.getItem("fs_adv_filter_presets") || "{}");
  const cur = sel.value;
  sel.innerHTML = '<option value="">Load preset…</option>' +
    Object.keys(presets).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  if (cur) sel.value = cur;
}

function renderAll() {
  const rows = filteredApplicants();
  renderKpis(rows);
  renderTable(rows);
  $("rowMeta").textContent = `${rows.length} of ${state.applicants.length} registrants shown`;
  // Wire checkbox events after render
  const chks = document.querySelectorAll(".row-chk");
  chks.forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.dataset.id;
      if (chk.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      updateBulkBar();
    });
  });
  const allChk = $("selectAllChk");
  if (allChk) {
    allChk.checked = rows.length > 0 && rows.every((a) => state.selectedIds.has(String(a.id)));
    allChk.addEventListener("change", () => {
      if (allChk.checked) rows.forEach((a) => state.selectedIds.add(String(a.id)));
      else state.selectedIds.clear();
      renderAll();
    });
  }
}
function listRows(items, renderLabel) {
  if (!items.length) return `<div class="row muted">No records yet.</div>`;
  return items.map((item) => `<div class="row"><span>${renderLabel(item)}</span><span class="muted">${esc(fmt(item.created_at || item.updated_at || item.timestamp || item.scheduled_for || item.date))}</span></div>`).join("");
}
function openDrawer(applicantId) {
  const app = state.applicants.find((a) => String(a.id) === String(applicantId));
  if (!app) return;
  state.selectedApplicantId = String(app.id);
  state.latestViewedApplicantId = String(app.id);
  const cls = getClassInfo(app.class_option_id);
  const attendance = getAttendanceSummary(app);
  const moodleStatus = state.moodle.find((m) => String(m.applicant_id || m.student_id || "") === String(app.id))?.status || "Unknown";
  $("drawerName").textContent = app.full_name || "Student";
  $("drawerSub").textContent = `${app.email || "-"} · ${app.phone || app.phone_number || "-"}`;
  $("overviewKv").innerHTML = `
    <div><label>Fellowship</label><strong>${esc(app.fellowship_code || app.fellowship || app.subgroup_id || "-")}</strong></div>
    <div><label>Assigned Class</label><strong>${esc(app.class_option_id || "-")}</strong></div>
    <div><label>Teacher</label><strong>${esc(cls?.teacher_name || cls?.teacher_id || "-")}</strong></div>
    <div><label>Batch</label><strong>${esc(app.batch_id || cls?.batch_id || "-")}</strong></div>
    <div><label>Moodle Sync</label><strong>${esc(moodleStatus)}</strong></div>
    <div><label>ClickUp Task</label><strong>${esc(app.clickup_task_url || app.clickup_url || "Not linked")}</strong></div>
  `;
  $("milestoneChips").innerHTML = milestoneKeys.map((k) => `<span class="chip" style="opacity:${app[k] ? 1 : .45}">${esc(milestoneLabels[k])}</span>`).join("");
  $("attendanceKv").innerHTML = `
    <div><label>Attendance %</label><strong>${attendance.pct == null ? "-" : `${attendance.pct}%`}</strong></div>
    <div><label>Sessions Attended</label><strong>${attendance.attended}/${attendance.total}</strong></div>
    <div><label>Last Attendance</label><strong>${esc(fmt(attendance.last))}</strong></div>
    <div><label>Missing Sessions</label><strong>${attendance.missing}</strong></div>
  `;
  const notifRows = getNotificationRows(app).slice(0, 40);
  $("notificationHistory").innerHTML = listRows(notifRows, (n) => `${esc(String(n.status || n.event_status || n.provider_status || "PENDING").toUpperCase())} · ${esc(n.event_type || "EVENT")}`);
  const emailRows = state.emails.filter((e) => {
    const aid = String(e.applicant_id || e.student_id || "");
    const aemail = String(e.recipient_email || e.email || "").toLowerCase();
    return (aid && aid === String(app.id)) || (aemail && aemail === String(app.email || "").toLowerCase());
  }).slice(0, 40);
  $("emailHistory").innerHTML = listRows(emailRows, (e) => `${esc(e.subject || e.template_key || "Email")} · ${esc(String(e.status || "PENDING").toUpperCase())}`);
  const auditRows = state.audits.filter((a) => {
    if (String(a.entity_id || "") === String(app.id)) return true;
    const d = a.details || {};
    return String(d.applicant_id || "") === String(app.id);
  }).slice(0, 50);
  $("auditHistory").innerHTML = listRows(auditRows, (a) => `${esc(a.action || "ADMIN_ACTION")} · ${esc(a.actor_email || "staff")}`);
  $("openClickupBtn").disabled = !(app.clickup_task_url || app.clickup_url);
  $("detailDrawer").classList.add("open");
  $("drawerOverlay").classList.add("open");
  $("detailDrawer").setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  $("detailDrawer").classList.remove("open");
  $("detailDrawer").setAttribute("aria-hidden", "true");
  if (!$("classCorrectionModal").classList.contains("open")) $("drawerOverlay").classList.remove("open");
}
function renderClassModalMeta(classRow, applicant) {
  const classId = classIdOf(classRow);
  const cap = classCapacityInfo(classId);
  $("classMeta").innerHTML = `
    <div><label>Teacher</label><strong>${esc(classRow?.teacher_name || classRow?.teacher_id || "-")}</strong></div>
    <div><label>Capacity</label><strong>${cap.current}/${cap.max || "-"}${cap.full ? " (Full)" : ""}</strong></div>
    <div><label>Batch</label><strong>${esc(classRow?.batch_id || "-")}</strong></div>
    <div><label>Class Day/Time</label><strong>${esc(classRow?.day || "-")} ${esc(classRow?.class_time || classRow?.time_slot || "")}</strong></div>
  `;
  const warnings = [];
  const applicantFellowship = String(applicant.fellowship_code || applicant.fellowship || applicant.subgroup_id || "");
  const classFellowship = String(classRow?.subgroup_id || classRow?.group_id || classRow?.fellowship_code || "");
  if (classFellowship && applicantFellowship && classFellowship !== applicantFellowship) warnings.push("This class appears to be in a different fellowship/campus.");
  if ((applicant.batch_id || "") && (classRow?.batch_id || "") && String(applicant.batch_id) !== String(classRow.batch_id)) warnings.push("This change moves the applicant to a different batch.");
  $("modalWarnings").innerHTML = warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join("");
}
function openCorrectionModal(applicantId) {
  const app = state.applicants.find((a) => String(a.id) === String(applicantId));
  if (!app) return;
  state.selectedApplicantId = String(app.id);
  $("modalError").innerHTML = "";
  const options = state.classOptions.filter((c) => c.active !== false).map((c) => {
    const id = classIdOf(c);
    const cap = classCapacityInfo(id);
    const label = `${id} · ${c.teacher_name || c.teacher_id || "No Teacher"} · ${c.day || ""} ${c.class_time || c.time_slot || ""} · ${cap.current}/${cap.max || "-"}`;
    return `<option value="${esc(id)}">${esc(label)}</option>`;
  }).join("");
  $("newClassOptionId").innerHTML = options || "";
  $("currentClassDisplay").value = app.class_option_id || "Unassigned";
  if (app.class_option_id) $("newClassOptionId").value = String(app.class_option_id);
  renderClassModalMeta(getClassInfo($("newClassOptionId").value), app);
  $("classCorrectionModal").classList.add("open");
  $("drawerOverlay").classList.add("open");
}
function closeCorrectionModal() {
  $("classCorrectionModal").classList.remove("open");
  if (!$("detailDrawer").classList.contains("open")) $("drawerOverlay").classList.remove("open");
}
async function saveCorrection() {
  const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
  if (!app) return;
  const newClassOptionId = $("newClassOptionId").value;
  const reason = ($("correctionReason")?.value || "").trim();
  const cls = getClassInfo(newClassOptionId);
  if (!newClassOptionId || !cls) {
    $("modalError").innerHTML = `<div class="err">Please select a valid class option.</div>`;
    return;
  }
  if (reason.length < 10) {
    $("modalError").innerHTML = `<div class="err">Reason is required (minimum 10 characters).</div>`;
    return;
  }
  const cap = classCapacityInfo(newClassOptionId);
  const changing = String(app.class_option_id || "") !== String(newClassOptionId);
  const projected = changing ? cap.current + 1 : cap.current;
  if (cap.max > 0 && projected > cap.max) {
    $("modalError").innerHTML = `<div class="err">Selected class is full (${cap.current}/${cap.max}). Choose another class.</div>`;
    return;
  }
  const now = new Date().toISOString();
  const updatePayload = { class_option_id: newClassOptionId, status: "CLASS_ASSIGNED", updated_at: now };
  if (cls.batch_id) updatePayload.batch_id = cls.batch_id;
  const { error: appErr } = await supabase.from("applicants").update(updatePayload).eq("id", app.id);
  if (appErr) {
    $("modalError").innerHTML = `<div class="err">Failed to update applicant: ${esc(appErr.message)}</div>`;
    return;
  }
  await supabase.from("notification_events").insert({
    applicant_id: app.id,
    event_type: "CLASS_ASSIGNED",
    status: "PENDING",
    recipient_email: app.email || null,
    metadata: { previous_class_option_id: app.class_option_id || null, new_class_option_id: newClassOptionId, changed_by: state.auth?.profile?.email || null, reason },
    created_at: now
  });
  // Queue class reassignment email
  if (app.email) {
    const firstName = String(app.full_name || "Student").split(/\s+/)[0];
    await supabase.from("email_queue").insert({
      recipient_email: app.email,
      recipient_name: app.full_name || "",
      template_key: "class_reassignment_notice",
      subject: "Your Foundation School class has been updated",
      status: "Pending",
      payload: {
        first_name: firstName, full_name: app.full_name || "",
        previous_class: app.class_option_id || "Unassigned",
        new_class: newClassOptionId,
        teacher: cls.teacher_name || cls.teacher_id || "",
        day: cls.day || "", time: cls.class_time || cls.time_slot || "",
        reason,
        changed_by: state.auth?.profile?.email || "",
      },
    });
  }
  // Reset Moodle enrollment sync so it re-enrolls in the new class
  await supabase.from("moodle_enrollment_sync")
    .update({ sync_status: "PENDING", updated_at: now })
    .eq("applicant_id", app.id);
  await supabase.from("audit_logs").insert({
    action: "CLASS_ASSIGNMENT_CORRECTED",
    entity_type: "applicant",
    entity_id: String(app.id),
    actor_email: state.auth?.profile?.email || null,
    status: "SUCCESS",
    details: {
      applicant_id: app.id,
      previous_class_option_id: app.class_option_id || null,
      new_class_option_id: newClassOptionId,
      previous_batch_id: app.batch_id || null,
      new_batch_id: cls.batch_id || app.batch_id || null,
      reason,
    },
    created_at: now
  });
  closeCorrectionModal();
  await loadData();
  showFlash("Class assignment corrected. Reassignment email queued.");
  openDrawer(app.id);
}
async function overrideStatus() {
  const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
  if (!app) return;
  const newStatus = $("statusOverrideSelect").value;
  const msgEl = $("statusOverrideMsg");
  if (!newStatus) { msgEl.textContent = "Please select a status."; return; }
  const now = new Date().toISOString();
  const { error } = await supabase.from("applicants")
    .update({ status: newStatus, registration_status: newStatus, updated_at: now })
    .eq("id", app.id);
  if (error) { msgEl.textContent = `Failed: ${error.message}`; return; }
  await supabase.from("audit_logs").insert({
    action: "STATUS_OVERRIDE",
    entity_type: "applicant",
    entity_id: String(app.id),
    actor_email: state.auth?.profile?.email || null,
    status: "SUCCESS",
    details: { applicant_id: app.id, new_status: newStatus, previous_status: app.status || app.registration_status || null },
    created_at: now,
  });
  msgEl.textContent = "";
  await loadData();
  openDrawer(app.id);
  showFlash(`Status overridden to ${newStatus}.`);
}
async function markNeedsFollowup() {
  const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
  if (!app) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("applicants").update({ needs_follow_up: true, updated_at: now }).eq("id", app.id);
  if (error) { showFlash(`Could not mark follow-up: ${error.message}`, "error"); return; }
  await supabase.from("audit_logs").insert({
    action: "APPLICANT_NEEDS_FOLLOW_UP",
    entity_type: "applicant",
    entity_id: String(app.id),
    actor_email: state.auth?.profile?.email || null,
    status: "SUCCESS",
    details: { applicant_id: app.id },
    created_at: now
  });
  await loadData();
  openDrawer(app.id);
  showFlash("Marked for follow-up.");
}
async function retryNotification() {
  const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
  if (!app) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("notification_events").insert({
    applicant_id: app.id,
    event_type: "CLASS_ASSIGNED",
    status: "RETRIED",
    recipient_email: app.email || null,
    metadata: { retry_requested_by: state.auth?.profile?.email || null },
    created_at: now
  });
  if (error) { showFlash(`Retry failed: ${error.message}`, "error"); return; }
  await loadData();
  openDrawer(app.id);
  showFlash("Retry event created for notification sender.");
}
function wireFilters() {
  $("globalSearch").addEventListener("input", (e) => { state.filters.search = e.target.value; renderAll(); });
  $("quickAssignment").addEventListener("change", (e) => { state.filters.assignment = e.target.value; renderAll(); });
  $("quickNotif").addEventListener("change", (e) => { state.filters.notif = e.target.value; renderAll(); });
  $("fellowshipFilter").addEventListener("change", (e) => { state.filters.fellowship = e.target.value; renderAll(); });
  $("classFilter").addEventListener("change", (e) => { state.filters.classOption = e.target.value; renderAll(); });
  $("batchFilter").addEventListener("change", (e) => { state.filters.batch = e.target.value; renderAll(); });
  $("milestoneFilter").addEventListener("change", (e) => { state.filters.milestone = e.target.value; renderAll(); });
  $("attendanceFilter").addEventListener("change", (e) => { state.filters.attendance = e.target.value; renderAll(); });
  $("statusFilter").addEventListener("change", (e) => { state.filters.status = e.target.value; renderAll(); });
  $("dateFilter").addEventListener("change", (e) => { state.filters.date = e.target.value; renderAll(); });
  $("clearFilters").addEventListener("click", () => {
    Object.keys(state.filters).forEach((k) => state.filters[k] = "");
    ["globalSearch", "quickAssignment", "quickNotif", "fellowshipFilter", "classFilter", "batchFilter", "milestoneFilter", "attendanceFilter", "statusFilter", "dateFilter"].forEach((id) => { $(id).value = ""; });
    renderAll();
  });
}
function wireActions() {
  $("refreshBtnTop").addEventListener("click", loadData);
  $("refreshBtn").addEventListener("click", loadData);
  $("drawerOverlay").addEventListener("click", () => { closeCorrectionModal(); closeDrawer(); });
  $("closeDrawerBtn").addEventListener("click", closeDrawer);
  $("changeClassBtn").addEventListener("click", () => openCorrectionModal(state.selectedApplicantId));
  $("needsFollowUpBtn").addEventListener("click", markNeedsFollowup);
  $("retryNotificationBtn").addEventListener("click", retryNotification);
  $("openAttendanceBtn").addEventListener("click", () => { window.location.href = "/foundation/staff/TeacherAttendancePortal.html"; });
  $("openMilestonesBtn").addEventListener("click", () => { window.location.href = "/foundation/staff/StudentProgressView.html"; });
  $("openClickupBtn").addEventListener("click", () => {
    const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
    const url = app?.clickup_task_url || app?.clickup_url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });
  $("openSelectedBtn").addEventListener("click", () => {
    if (state.latestViewedApplicantId) openDrawer(state.latestViewedApplicantId);
    else showFlash("Open a student first.", "warn");
  });
  $("newClassOptionId").addEventListener("change", () => {
    const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
    if (!app) return;
    renderClassModalMeta(getClassInfo($("newClassOptionId").value), app);
  });
  $("closeCorrectionBtn").addEventListener("click", closeCorrectionModal);
  $("cancelCorrectionBtn").addEventListener("click", closeCorrectionModal);
  $("saveCorrectionBtn").addEventListener("click", saveCorrection);
  $("applyStatusOverrideBtn").addEventListener("click", overrideStatus);

  // Advanced filters
  $("toggleAdvFilters").addEventListener("click", () => {
    const panel = $("advFilterPanel");
    const open = panel.style.display === "none" || !panel.style.display;
    panel.style.display = open ? "" : "none";
  });
  $("afApplyBtn").addEventListener("click", () => {
    state.advFilters = {
      dateFrom: $("afDateFrom").value,
      dateTo:   $("afDateTo").value,
      moodle:   $("afMoodle").value,
      attStatus:$("afAttStatus").value,
      active:   true,
    };
    updateAdvFilterBadge();
    renderAll();
  });
  $("afResetBtn").addEventListener("click", () => {
    state.advFilters = { dateFrom: "", dateTo: "", moodle: "", attStatus: "", active: false };
    ["afDateFrom","afDateTo","afMoodle","afAttStatus"].forEach((id) => { $(id) && ($(id).value = ""); });
    updateAdvFilterBadge();
    renderAll();
  });
  $("afSaveBtn").addEventListener("click", saveFilterPreset);
  $("afPresetSelect").addEventListener("change", (e) => {
    const name = e.target.value;
    if (!name) return;
    const presets = JSON.parse(localStorage.getItem("fs_adv_filter_presets") || "{}");
    const p = presets[name];
    if (!p) return;
    if (p.dateFrom) { $("afDateFrom").value = p.dateFrom; }
    if (p.dateTo)   { $("afDateTo").value   = p.dateTo; }
    if (p.moodle)   { $("afMoodle").value   = p.moodle; }
    if (p.attStatus){ $("afAttStatus").value = p.attStatus; }
    state.advFilters = { dateFrom: p.dateFrom || "", dateTo: p.dateTo || "", moodle: p.moodle || "", attStatus: p.attStatus || "", active: true };
    updateAdvFilterBadge();
    renderAll();
  });
  loadPresetOptions();

  // Bulk actions
  $("bulkStatusSelect").addEventListener("change", async (e) => {
    if (e.target.value) await executeBulkStatus(e.target.value);
  });
  $("bulkClassSelect").addEventListener("change", async (e) => {
    if (e.target.value) await executeBulkClass(e.target.value);
  });
  $("bulkEmailBtn").addEventListener("click", () => {
    const emails = [...state.selectedIds].map((id) => {
      const a = state.applicants.find((x) => String(x.id) === id);
      return a?.email;
    }).filter(Boolean);
    if (!emails.length) { showFlash("No students selected.", "warn"); return; }
    const subject = prompt("Email subject:");
    if (!subject) return;
    const message = prompt("Email message body:");
    if (!message) return;
    const now = new Date().toISOString();
    Promise.all(emails.map((email) => {
      const app = state.applicants.find((a) => (a.email || "").toLowerCase() === email.toLowerCase());
      return supabase.from("email_queue").insert({
        recipient_email: email, recipient_name: app?.full_name || "",
        template_key: "announcement", subject, status: "Pending",
        payload: { full_name: app?.full_name || "", message },
      });
    })).then(() => {
      state.selectedIds.clear();
      updateBulkBar();
      showFlash(`Email queued for ${emails.length} students.`);
    });
  });
  $("bulkExportBtn").addEventListener("click", exportCsv);
  $("bulkClearBtn").addEventListener("click", () => {
    state.selectedIds.clear();
    updateBulkBar();
    renderAll();
  });
}
async function safeLoad(queryFn, fallback = []) {
  try { return await queryFn(); } catch { return fallback; }
}
async function loadData() {
  const [applicants, classOptions, batches, notifications, emails, audits, moodle, attendance] = await Promise.all([
    safeLoad(async () => {
      const { data, error } = await supabase.from("applicants").select("*").order("created_at", { ascending: false }).limit(3000);
      if (error) throw error;
      return data || [];
    }),
    safeLoad(async () => {
      const { data, error } = await supabase.from("class_options").select("*").limit(3000);
      if (error) throw error;
      return data || [];
    }),
    safeLoad(async () => {
      const { data, error } = await supabase.from("batches").select("batch_id,batch_name,start_sunday,status,active").limit(500);
      if (error) throw error;
      return data || [];
    }),
    safeLoad(async () => {
      const { data, error } = await supabase.from("notification_events").select("*").order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      return data || [];
    }),
    safeLoad(async () => {
      const { data, error } = await supabase.from("email_queue").select("*").order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      return data || [];
    }),
    safeLoad(async () => {
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      return data || [];
    }),
    safeLoad(async () => {
      const { data, error } = await supabase.from("moodle_sync").select("*").limit(5000);
      if (error) throw error;
      return data || [];
    }),
    safeLoad(async () => {
      const { data, error } = await supabase.from("attendance_log").select("*").order("created_at", { ascending: false }).limit(10000);
      if (error) throw error;
      return data || [];
    })
  ]);
  state.applicants = applicants;
  state.classOptions = classOptions;
  state.batches = batches;
  state.notifications = notifications;
  state.emails = emails;
  state.audits = audits;
  state.moodle = moodle;
  state.attendance = attendance;
  buildFilterOptions();
  renderAll();
}
async function boot() {
  initTheme();
  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF") || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
    window.FSAdminShell && window.FSAdminShell.mount({ active: "applicants", pageTitle: "Applicant Directory", profileName: "Not connected" });
    $("flashArea").innerHTML = `<div class="err">⚠ Not connected — open this page through a live server with config.js in place to load data</div>`;
    return;
  }
  const auth = await requireAuth(["admin", "superadmin", "principal", "regional_secretary"]);
  if (!auth) return;
  state.auth = auth;
  window.FSAdminShell && window.FSAdminShell.mount({
    active: "applicants",
    pageTitle: "Applicant Directory",
    role: auth.profile?.role || null
  });
  wireFilters();
  wireActions();
  await loadData();
}
boot().catch((e) => {
  $("flashArea").innerHTML = `<div class="err">Failed to load directory: ${esc(e?.message || e)}</div>`;
});

