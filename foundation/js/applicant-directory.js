import { CONFIG as AUTH_CONFIG, supabase as AUTH_SUPABASE, requireAuth as AUTH_REQUIRE_AUTH } from "../auth/auth-client.js";

let CONFIG = {};
let supabase = null;
let requireAuth = null;

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const fmt = (v) => v ? new Date(v).toLocaleString() : "-";
const ymd = (v) => {
  if (!v) return "";
  try { return new Date(v).toISOString().slice(0, 10); } catch (_) { return ""; }
};
const fallbackMilestoneDefs = [
  { code: "BORN_AGAIN", label: "Born Again" },
  { code: "FILLED_WITH_SPIRIT", label: "Filled with the Spirit" },
  { code: "PARTNERSHIP", label: "Partnership" },
  { code: "JOINED_CELL", label: "Joined Cell" },
  { code: "SERVING_TEAM_INTEREST", label: "Serving Team Interest" },
  { code: "NEEDS_FOLLOW_UP", label: "Needs Follow-up" },
  { code: "FOUNDATION_COMPLETED", label: "Foundation Completed" },
];

const state = {
  auth: null,
  mode: "directory",
  applicants: [], classOptions: [], batches: [], notifications: [], emails: [], audits: [], moodle: [], attendance: [],
  milestoneDefs: fallbackMilestoneDefs,
  milestoneStatusRows: [],
  milestonesByApplicant: new Map(),
  quickTab: "all",
  filters: { search: "", fellowship: "", classOption: "", batch: "", assignment: "", notif: "", milestone: "", attendance: "", status: "", date: "" },
  advFilters: { dateFrom: "", dateTo: "", moodle: "", attStatus: "", active: false },
  selectedApplicantId: null, latestViewedApplicantId: null, selectedIds: new Set(),
};

const canDecisionActions = () => ["admin", "superadmin", "principal", "regional_secretary"].includes(String(state.auth?.profile?.role || "").toLowerCase());

function showFlash(msg, type = "success") { const klass = type === "error" ? "err" : type === "warn" ? "warn" : "success"; $("flashArea").innerHTML = `<div class="${klass}">${esc(msg)}</div>`; setTimeout(() => { if ($("flashArea")) $("flashArea").innerHTML = ""; }, 4200); }
const setTheme = () => { document.documentElement.setAttribute("data-theme", "light"); localStorage.setItem("fs_theme", "light"); };
const statusPill = (status) => { const normalized = String(status || "PENDING").toUpperCase(); const map = { SENT: "completed", PENDING: "attention", FAILED: "duplicate", RETRIED: "assigned" }; return `<span class="pill ${map[normalized] || "unassigned"}">${esc(normalized)}</span>`; };
const displayGroupValue = (app) => (String(app?.fellowship_code || "").toUpperCase() === "REGIONAL" && !app?.group_id ? "Regional" : (app?.group_id || "-"));
const displaySubgroupValue = (app) => (String(app?.fellowship_code || "").toUpperCase() === "REGIONAL" && !app?.subgroup_id ? "Regional" : (app?.subgroup_id || "-"));
const normalizedMilestoneCode = (v) => String(v || "").trim().toUpperCase();
const milestoneKeys = () => state.milestoneDefs.map((m) => normalizedMilestoneCode(m.code)).filter(Boolean);
const milestoneLabels = () => {
  const out = {};
  state.milestoneDefs.forEach((m) => { out[normalizedMilestoneCode(m.code)] = m.label || m.code; });
  return out;
};
function buildMilestoneCache() {
  const byApplicant = new Map();
  (state.milestoneStatusRows || []).forEach((row) => {
    const applicantId = String(row.applicant_id || "").trim();
    const code = normalizedMilestoneCode(row.milestone_code);
    if (!applicantId || !code || row.completed !== true) return;
    if (!byApplicant.has(applicantId)) byApplicant.set(applicantId, new Set());
    byApplicant.get(applicantId).add(code);
  });
  state.milestonesByApplicant = byApplicant;
}
const getApplicantMilestones = (app) => [...(state.milestonesByApplicant.get(String(app.id || "")) || new Set())];
const classIdOf = (row) => String(row?.class_option_id || row?.id || "");
const getClassInfo = (id) => state.classOptions.find((c) => classIdOf(c) === String(id || "")) || null;

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

function getAttendanceStatusCounts(app) {
  const out = { SUBMITTED: 0, LATE_START: 0, MISSING: 0 };
  getAttendanceRows(app).forEach((r) => {
    const key = String(r.session_status || "SUBMITTED").toUpperCase();
    if (key === "LATE_START" || key === "MISSING" || key === "SUBMITTED") out[key] += 1;
    else out.SUBMITTED += 1;
  });
  return out;
}

const attendanceStatusBadge = (label, cls, count) => count ? `<span class="pill ${cls}">${esc(label)} (${count})</span>` : "";
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

function summarizeApplicant(app) {
  const milestones = getApplicantMilestones(app);
  const attendance = getAttendanceSummary(app);
  const completed = milestones.length >= milestoneKeys().length && milestoneKeys().length > 0;
  return {
    milestoneCount: milestones.length,
    attendancePct: attendance.pct,
    notificationState: getNotificationState(app),
    completed,
    needsFollowUp: Boolean(app.needs_follow_up || app.needs_admin_review),
    duplicate: Number(app.duplicate_count || 0) > 1,
    lastActivity: [app.updated_at, app.created_at, getNotificationRows(app)[0]?.created_at, getAttendanceRows(app)[0]?.created_at || getAttendanceRows(app)[0]?.date].filter(Boolean).sort().at(-1) || null,
  };
}

function classifyRowStatus(app, summary) {
  if (summary.duplicate) return { label: "Duplicate", cls: "duplicate" };
  if (summary.needsFollowUp) return { label: "Needs Attention", cls: "attention" };
  if (summary.completed) return { label: "Completed", cls: "completed" };
  if (app.class_option_id) return { label: "Assigned", cls: "assigned" };
  return { label: "Unassigned", cls: "unassigned" };
}

function milestoneStatus(summary) {
  const total = milestoneKeys().length;
  const done = Number(summary?.milestoneCount || 0);
  if (done <= 0) return { label: "Not Started", cls: "unassigned", counter: `0/${total}` };
  if (done >= total) return { label: "Complete", cls: "completed", counter: `${total}/${total}` };
  return { label: "In Progress", cls: "assigned", counter: `${done}/${total}` };
}

function classCapacityInfo(classOptionId) {
  const cls = getClassInfo(classOptionId);
  const current = state.applicants.filter((a) => String(a.class_option_id || "") === String(classOptionId || "")).length;
  const max = Number(cls?.capacity || cls?.max_capacity || cls?.class_capacity || 0) || 0;
  return { current, max, full: max > 0 && current >= max };
}

const ctx = { state, $, esc, fmt, ymd, milestoneKeys, milestoneLabels, getApplicantMilestones, supabase, showFlash, classIdOf, getClassInfo, classCapacityInfo, summarizeApplicant, classifyRowStatus, getAttendanceSummary, getNotificationRows, getAttendanceStatusCounts, attendanceStatusBadge, displayGroupValue, displaySubgroupValue };
const Filters = window.FSApplicantDirectoryFilters;
const Drawer = window.FSApplicantDirectoryDrawer;
const Actions = window.FSApplicantDirectoryActions;
window.openDrawer = (id) => Drawer.openDrawer(ctx, id);
window.closeDrawer = () => Drawer.closeDrawer(ctx);
window.renderDrawerContent = (id) => Drawer.renderDrawerContent(ctx, id);
window.applyFilters = () => Filters.applyFilters(ctx);
window.renderFilters = () => Filters.renderFilters(ctx);
window.sendEmail = (id) => Actions.sendEmail(ctx, id);
window.bulkAction = (kind, value) => Actions.bulkAction(ctx, kind, value);
window.exportData = () => Actions.exportData(ctx);

function renderKpis(rows) {
  const total = rows.length;
  const assigned = rows.filter((a) => Boolean(a.class_option_id)).length;
  const unassigned = total - assigned;
  const duplicates = rows.filter((a) => Number(a.duplicate_count || 0) > 1).length;
  const needsAttention = rows.filter((a) => summarizeApplicant(a).needsFollowUp).length;
  const items = [["Total Registrants", total, "All visible records"], ["Assigned Students", assigned, `${total ? Math.round((assigned / total) * 100) : 0}% assigned`], ["Unassigned Students", unassigned, "Need class placement"], ["Duplicates", duplicates, "Potential data merge review"], ["Needs Attention", needsAttention, "Follow-up required"]];
  $("kpiGrid").innerHTML = items.map(([l, v, s]) => `<article class="card"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${esc(v)}</div><div class="kpi-sub">${esc(s)}</div></article>`).join("");
}

function renderActionButtons(app) {
  if (state.mode === "review" && canDecisionActions()) {
    return `<div class="btns"><button class="btn primary" data-assign="${esc(app.id)}">Assign Class</button><button class="btn" data-open="${esc(app.id)}">Open</button><button class="btn" data-mark-status="WAITLISTED" data-id="${esc(app.id)}">Waitlist</button><button class="btn" data-mark-status="DUPLICATE" data-id="${esc(app.id)}">Duplicate</button><button class="btn" data-mark-status="REVIEW" data-id="${esc(app.id)}">Flag Review</button></div>`;
  }
  return `<div class="btns"><button class="btn" data-open="${esc(app.id)}">Open</button><button class="btn" data-profile="${esc(app.id)}">Profile</button><button class="btn" data-direct-email="${esc(app.id)}">Email</button></div>`;
}

function renderTable(rows) {
  const classMap = new Map(state.classOptions.map((c) => [classIdOf(c), c]));
  $("tableWrap").innerHTML = `<table><thead><tr><th style="width:32px"><input type="checkbox" id="selectAllChk" style="cursor:pointer;width:16px;height:16px" /></th><th>Student</th><th>Fellowship</th><th>Assigned Class</th><th>Teacher</th><th>Batch</th><th>Milestones</th><th>Attendance %</th><th>Notification State</th><th>Last Activity</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map((app) => { const summary = summarizeApplicant(app); const milestone = milestoneStatus(summary); const cls = classMap.get(String(app.class_option_id || "")); const rowStatus = classifyRowStatus(app, summary); const checked = state.selectedIds.has(String(app.id)) ? "checked" : ""; return `<tr><td style="width:32px;padding:8px"><input type="checkbox" class="row-chk" data-id="${esc(app.id)}" ${checked} style="cursor:pointer;width:16px;height:16px" /></td><td class="student-cell" data-row-open="${esc(app.id)}" title="Open student drawer" style="cursor:pointer"><div class="name">${esc(app.full_name || "-")}</div><div class="sub">${esc(app.email || "-")} · ${esc(app.phone || app.phone_number || "-")}</div></td><td>${esc(app.fellowship_code || app.fellowship || app.subgroup_id || "-")}</td><td>${esc(app.class_option_id || "-")}</td><td>${esc(cls?.teacher_name || cls?.teacher_id || "-")}</td><td>${esc(app.batch_id || cls?.batch_id || "-")}</td><td><span class="pill ${milestone.cls}">${esc(milestone.counter)} · ${esc(milestone.label)}</span></td><td>${summary.attendancePct == null ? "-" : `${summary.attendancePct}%`}</td><td>${statusPill(summary.notificationState)}</td><td>${esc(fmt(summary.lastActivity))}</td><td><span class="pill ${rowStatus.cls}">${esc(rowStatus.label)}</span></td><td>${renderActionButtons(app)}</td></tr>`; }).join("") || `<tr><td colspan="12" class="muted">No registrants match the current filters.</td></tr>`}</tbody></table>`;
  document.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => {
    const id = String(btn.getAttribute("data-open") || "");
    if (!id) return;
    state.selectedApplicantId = id;
    state.latestViewedApplicantId = id;
    Drawer.openDrawer(ctx, id);
  }));
  document.querySelectorAll("[data-assign]").forEach((btn) => btn.addEventListener("click", () => {
    const id = String(btn.getAttribute("data-assign") || "");
    if (!id) return;
    state.selectedApplicantId = id;
    state.latestViewedApplicantId = id;
    openClassCorrectionModal();
  }));
  document.querySelectorAll("[data-row-open]").forEach((cell) => cell.addEventListener("click", () => {
    const id = String(cell.getAttribute("data-row-open") || "");
    if (!id) return;
    state.selectedApplicantId = id;
    state.latestViewedApplicantId = id;
    Drawer.openDrawer(ctx, id);
  }));
  document.querySelectorAll("[data-direct-email]").forEach((btn) => btn.addEventListener("click", () => Actions.sendEmail(ctx, btn.getAttribute("data-direct-email"))));
  document.querySelectorAll("[data-mark-status]").forEach((btn) => btn.addEventListener("click", () => markApplicantStatus(btn.getAttribute("data-id"), btn.getAttribute("data-mark-status"))));
  document.querySelectorAll("[data-profile]").forEach((btn) => btn.addEventListener("click", () => {
    const id = String(btn.getAttribute("data-profile") || "");
    if (!id) return;
    state.selectedApplicantId = id;
    state.latestViewedApplicantId = id;
    window.FSStudentProfile?.open(id);
  }));
}

function renderStudentsByBatch(rows) {
  const wrap = $("batchStudentsWrap");
  if (!wrap) return;
  const classMap = new Map(state.classOptions.map((c) => [classIdOf(c), c]));
  const batches = new Map();
  rows.forEach((app) => {
    const cls = classMap.get(String(app.class_option_id || ""));
    const batchId = String(app.batch_id || cls?.batch_id || "Unbatched");
    if (!batches.has(batchId)) batches.set(batchId, []);
    batches.get(batchId).push({ app, cls });
  });

  const ordered = [...batches.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (!ordered.length) {
    wrap.innerHTML = `<div class="row muted">No students match the current filters.</div>`;
    return;
  }

  wrap.innerHTML = ordered.map(([batchId, items]) => {
    const batchMeta = state.batches.find((b) => String(b.batch_id || "") === String(batchId));
    const title = batchMeta?.batch_name ? `${batchMeta.batch_name} (${batchId})` : batchId;
    const students = items.sort((x, y) => String(x.app.full_name || "").localeCompare(String(y.app.full_name || ""))).map(({ app, cls }) => `<div class="row" data-batch-open="${esc(app.id)}" style="cursor:pointer" title="Open student drawer"><div><strong>${esc(app.full_name || "-")}</strong><div class="muted" style="font-size:12px">${esc(app.email || "-")}</div></div><div style="text-align:right"><div>${esc(app.class_option_id || "-")}</div><div class="muted" style="font-size:12px">${esc(cls?.teacher_name || cls?.teacher_id || "-")}</div></div></div>`).join("");
    return `<details style="border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:var(--surface-2);margin-bottom:8px" open><summary style="cursor:pointer;font-weight:800">${esc(title)} <span class="muted" style="font-weight:600">(${items.length})</span></summary><div style="margin-top:8px">${students}</div></details>`;
  }).join("");
  wrap.querySelectorAll("[data-batch-open]").forEach((row) => {
    row.addEventListener("click", () => Drawer.openDrawer(ctx, row.getAttribute("data-batch-open")));
  });
}

function applyModeUi() {
  const isReview = state.mode === "review";
  const title = $("pageTitle");
  const subtitle = $("pageSubtitle");
  if (title) title.textContent = "Applicants";
  if (subtitle) subtitle.textContent = isReview
    ? "Review queue mode: assign, waitlist, duplicate, and manual review"
    : "Directory mode: operational visibility, class correction, and follow-up tracking";
  const batchSection = $("studentsByBatchSection");
  if (batchSection) batchSection.style.display = isReview ? "none" : "";
}

const QUICK_TABS = [
  { id: "all",          label: "All Applicants" },
  { id: "needs_review", label: "Needs Review" },
  { id: "at_risk",      label: "At Risk" },
  { id: "waitlisted",   label: "Waitlisted" },
];

function renderQuickTabs() {
  const wrap = $("quickTabStrip");
  if (!wrap) return;
  wrap.innerHTML = QUICK_TABS.map((t) =>
    `<button class="fs-btn ${state.quickTab === t.id ? "fs-btn-primary" : "fs-btn-secondary"}" data-quick-tab="${esc(t.id)}">${esc(t.label)}</button>`
  ).join("");
  wrap.querySelectorAll("[data-quick-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.quickTab = btn.getAttribute("data-quick-tab") || "all";
      renderAll();
    })
  );
}

function renderModeTabs() {
  const wrap = $("modeTabs");
  if (!wrap) return;
  const tabs = [{ id: "review", label: "Review Queue" }, { id: "directory", label: "Directory" }];
  wrap.innerHTML = tabs.map((t) => `<button class="fs-btn ${state.mode === t.id ? "fs-btn-primary" : "fs-btn-secondary"}" data-mode-tab="${t.id}">${esc(t.label)}</button>`).join("");
  wrap.querySelectorAll("[data-mode-tab]").forEach((btn) => btn.addEventListener("click", () => setMode(btn.getAttribute("data-mode-tab"))));
}

function setMode(mode) {
  state.mode = String(mode || "directory").toLowerCase() === "review" ? "review" : "directory";
  const url = new URL(window.location.href);
  url.searchParams.set("tab", state.mode);
  window.history.replaceState({}, "", url.toString());
  renderModeTabs();
  applyModeUi();
  renderAll();
}

async function markApplicantStatus(applicantId, status) {
  if (!canDecisionActions()) {
    showFlash("You do not have permission for review decisions.", "warn");
    return;
  }
  const app = state.applicants.find((a) => String(a.id) === String(applicantId || ""));
  if (!app || !status) return;
  const now = new Date().toISOString();
  const patch = { registration_status: status, status, updated_at: now };
  if (status === "WAITLISTED") patch.retry_assignment = true;
  if (status === "DUPLICATE" || status === "REVIEW") patch.needs_admin_review = true;
  const { error } = await supabase.from("applicants").update(patch).eq("id", app.id);
  if (error) {
    showFlash(`Failed to update status: ${error.message || error}`, "error");
    return;
  }
  await supabase.from("audit_logs").insert({
    action: "APPLICANT_STATUS_SET",
    entity_type: "applicant",
    entity_id: app.id,
    actor_email: state.auth?.profile?.email || null,
    status: "SUCCESS",
    details: { previous_status: app.registration_status || app.status || null, new_status: status, source: "applicants-review-mode" },
    created_at: now,
  });
  showFlash(`Status updated to ${status}.`, "success");
  await loadData();
}

function renderAll() {
  renderQuickTabs();
  const rows = Filters.applyFilters(ctx);
  renderKpis(rows);
  renderTable(rows);
  if (state.mode !== "review") renderStudentsByBatch(rows);
  $("rowMeta").textContent = `${rows.length} of ${state.applicants.length} registrants shown`;
  document.querySelectorAll(".row-chk").forEach((chk) => chk.addEventListener("change", () => { chk.checked ? state.selectedIds.add(chk.dataset.id) : state.selectedIds.delete(chk.dataset.id); Actions.updateBulkBar(ctx); }));
  const allChk = $("selectAllChk");
  if (allChk) {
    allChk.checked = rows.length > 0 && rows.every((a) => state.selectedIds.has(String(a.id)));
    allChk.addEventListener("change", () => { if (allChk.checked) rows.forEach((a) => state.selectedIds.add(String(a.id))); else state.selectedIds.clear(); renderAll(); });
  }
  Actions.updateBulkBar(ctx);
  if (state.mode === "review") {
    const bulkBar = $("bulkBar");
    if (bulkBar) bulkBar.style.display = "none";
  }
}
ctx.filteredApplicants = () => Filters.applyFilters(ctx);

async function safeLoad(queryFn, fallback = []) { try { return await queryFn(); } catch { return fallback; } }
async function loadData() {
  const [applicants, classOptions, batches, notifications, emails, audits, moodle, attendance, milestoneDefs, milestoneStatusRows] = await Promise.all([
    safeLoad(async () => (await supabase.from("applicants").select("*").order("created_at", { ascending: false }).limit(3000)).data || []),
    safeLoad(async () => (await supabase.from("class_options").select("*").limit(3000)).data || []),
    safeLoad(async () => (await supabase.from("batches").select("batch_id,batch_name,start_sunday,status,active").limit(500)).data || []),
    safeLoad(async () => (await supabase.from("notification_events").select("*").order("created_at", { ascending: false }).limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("email_queue").select("*").order("created_at", { ascending: false }).limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("moodle_sync").select("*").limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("attendance_log").select("*").order("created_at", { ascending: false }).limit(10000)).data || []),
    safeLoad(async () => (await supabase.from("milestone_definitions").select("code,title,label,active").eq("active", true).order("sort_order", { ascending: true })).data || []),
    safeLoad(async () => (await supabase.from("student_milestone_status").select("applicant_id,milestone_code,completed,updated_at").eq("completed", true).limit(20000)).data || []),
  ]);
  const defs = (milestoneDefs || []).map((m) => ({
    code: normalizedMilestoneCode(m.code),
    label: String(m.label || m.title || m.code || "").trim(),
  })).filter((m) => m.code);
  Object.assign(state, {
    applicants, classOptions, batches, notifications, emails, audits, moodle, attendance,
    milestoneDefs: defs.length ? defs : fallbackMilestoneDefs,
    milestoneStatusRows: milestoneStatusRows || [],
  });
  buildMilestoneCache();
  Filters.renderFilters(ctx);
  renderAll();
}
ctx.loadData = loadData;

function closeClassModal() {
  $("classCorrectionModal").classList.remove("open");
  if (!$("detailDrawer").classList.contains("open")) $("drawerOverlay").classList.remove("open");
}

function openClassCorrectionModal() {
  const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
  if (!app) { showFlash("No student selected.", "warn"); return; }
  $("currentClassDisplay").value = app.class_option_id || "Unassigned";
  const sel = $("newClassOptionId");
  sel.innerHTML = '<option value="">Select new class…</option>' +
    state.classOptions
      .filter((c) => c.active !== false && c.class_option_id !== app.class_option_id)
      .sort((a, b) => String(a.class_option_id).localeCompare(String(b.class_option_id)))
      .map((c) => `<option value="${esc(c.class_option_id)}">${esc(c.class_option_id)} — ${esc(c.teacher_name || "")} ${esc(c.day || "")} ${esc(c.class_time || "")}</option>`)
      .join("");
  $("correctionReason").value = "";
  $("modalError").innerHTML = "";
  $("classMeta").innerHTML = "";
  $("modalWarnings").innerHTML = "";
  $("classCorrectionModal").classList.add("open");
  $("drawerOverlay").classList.add("open");
}

function wireActions() {
  $("refreshBtnTop").addEventListener("click", loadData);
  $("refreshBtn").addEventListener("click", loadData);
  $("drawerOverlay").addEventListener("click", () => {
    if (!$("classCorrectionModal").classList.contains("open")) Drawer.closeDrawer(ctx);
  });
  $("closeDrawerBtn").addEventListener("click", () => Drawer.closeDrawer(ctx));

  // Change Class — opens correction modal
  $("changeClassBtn").addEventListener("click", openClassCorrectionModal);
  $("cancelCorrectionBtn").addEventListener("click", closeClassModal);
  $("closeCorrectionBtn").addEventListener("click", closeClassModal);

  // Class select change — show capacity info
  $("newClassOptionId").addEventListener("change", () => {
    const val = $("newClassOptionId").value;
    if (!val) { $("classMeta").innerHTML = ""; $("modalWarnings").innerHTML = ""; return; }
    const cls = ctx.getClassInfo(val);
    const info = ctx.classCapacityInfo(val);
    $("classMeta").innerHTML = `
      <div><label>Teacher</label><strong>${esc(cls?.teacher_name || "-")}</strong></div>
      <div><label>Day / Time</label><strong>${esc(cls?.day || "-")} ${esc(cls?.class_time || "")}</strong></div>
      <div><label>Enrolled</label><strong>${info.current}${info.max ? " / " + info.max : ""}</strong></div>`;
    $("modalWarnings").innerHTML = info.full
      ? `<div class="warn">This class is at capacity. Assignment will be blocked.</div>` : "";
  });

  // Save class correction
  $("saveCorrectionBtn").addEventListener("click", async () => {
    const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
    if (!app) return;
    const newClassId = $("newClassOptionId").value;
    const reason = ($("correctionReason")?.value || "").trim();
    if (!newClassId) { $("modalError").innerHTML = '<div class="err">Please select a new class.</div>'; return; }
    if (reason.length < 10) { $("modalError").innerHTML = '<div class="err">Reason must be at least 10 characters.</div>'; return; }
    const info = ctx.classCapacityInfo(newClassId);
    if (info.full) { $("modalError").innerHTML = '<div class="err">This class is at capacity. Assignment blocked.</div>'; return; }
    const cls = ctx.getClassInfo(newClassId);
    const now = new Date().toISOString();
    const actor = state.auth?.profile?.email || null;
    const patch = { class_option_id: newClassId, registration_status: "ASSIGNED", assigned_at: now, updated_at: now };
    if (cls?.batch_id) patch.batch_id = cls.batch_id;
    const { error } = await supabase.from("applicants").update(patch).eq("id", app.id);
    if (error) { $("modalError").innerHTML = `<div class="err">${esc(error.message)}</div>`; return; }
    await supabase.from("email_queue").insert({
      recipient_email: app.email, recipient_name: app.full_name || "",
      template_key: "class_reassignment_notice",
      subject: "Your Rock Solid class has been updated",
      status: "Pending",
      payload: {
        first_name: String(app.full_name || "Student").split(/\s+/)[0],
        old_class: app.class_option_id || "Unassigned", new_class: newClassId,
        new_teacher: cls?.teacher_name || "", new_day: cls?.day || "", new_time: cls?.class_time || "",
        reason,
      },
    });
    await supabase.from("moodle_enrollment_sync")
      .update({ class_option_id: newClassId, sync_status: "PENDING", updated_at: now })
      .eq("applicant_id", app.id);
    await supabase.from("audit_logs").insert({
      action: "CLASS_CORRECTION", entity_type: "applicant", entity_id: app.id,
      actor_email: actor, status: "SUCCESS",
      details: { old_class: app.class_option_id, new_class: newClassId, reason },
      created_at: now,
    });
    closeClassModal();
    showFlash(`Class changed to ${newClassId}. Notification queued.`, "success");
    await loadData();
    Drawer.openDrawer(ctx, app.id);
  });

  // Mark Needs Follow-up — toggle
  $("needsFollowUpBtn").addEventListener("click", async () => {
    const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
    if (!app) { showFlash("No student selected.", "warn"); return; }
    const next = !app.needs_admin_review;
    const now = new Date().toISOString();
    const { error } = await supabase.from("applicants")
      .update({ needs_admin_review: next, updated_at: now }).eq("id", app.id);
    if (error) { showFlash(`Failed: ${error.message}`, "error"); return; }
    await supabase.from("audit_logs").insert({
      action: "NEEDS_FOLLOW_UP_TOGGLED", entity_type: "applicant", entity_id: app.id,
      actor_email: state.auth?.profile?.email || null, status: "SUCCESS",
      details: { needs_admin_review: next }, created_at: now,
    });
    showFlash(next ? "Marked as needs follow-up." : "Follow-up cleared.", "success");
    $("needsFollowUpBtn").textContent = next ? "✓ Needs Follow-up" : "Mark Needs Follow-up";
    await loadData();
    Drawer.renderDrawerContent(ctx, state.selectedApplicantId);
  });

  // Send Email
  $("sendEmailBtn").addEventListener("click", () => Actions.sendEmail(ctx, state.selectedApplicantId));

  // Open Attendance — opens FSStudentProfile on attendance tab (default)
  $("openAttendanceBtn").addEventListener("click", () => {
    if (!state.selectedApplicantId) { showFlash("No student selected.", "warn"); return; }
    Drawer.closeDrawer(ctx);
    window.FSStudentProfile?.open(state.selectedApplicantId);
  });

  // Open Milestones — opens FSStudentProfile on milestones tab
  $("openMilestonesBtn").addEventListener("click", () => {
    if (!state.selectedApplicantId) { showFlash("No student selected.", "warn"); return; }
    Drawer.closeDrawer(ctx);
    window.FSStudentProfile?.open(state.selectedApplicantId, { initialTab: "milestones" });
  });

  // Retry Notification — finds latest failed email_queue or scheduled_notification row and calls retry-worker
  $("retryNotificationBtn").addEventListener("click", async () => {
    const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
    if (!app) { showFlash("No student selected.", "warn"); return; }
    const isFailed = (st) => ["FAILED", "ERROR"].includes(String(st || "").trim().toUpperCase());
    const byApplicant = (r) => {
      const rid = String(r.applicant_id || r.student_id || "");
      const remail = String(r.recipient_email || r.email || "").toLowerCase();
      return (rid && rid === String(app.id)) || (app.email && remail === app.email.toLowerCase());
    };
    const failedEmail = state.emails.filter((e) => byApplicant(e) && isFailed(e.status))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    const failedNotif = state.notifications.filter((n) => byApplicant(n) && isFailed(n.status || n.event_status))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    const target = failedEmail || failedNotif;
    if (!target) { showFlash("No failed notifications found for this student.", "warn"); return; }
    const btn = $("retryNotificationBtn");
    btn.disabled = true;
    btn.textContent = "Retrying…";
    try {
      await supabase.functions.invoke("retry-worker", {
        body: {
          action: "retry",
          source: failedEmail ? "email_queue" : "scheduled_notifications",
          id: String(target.id),
        },
      });
      showFlash("Retry queued. Email will send on next run.", "success");
      btn.textContent = "Retried ✓";
      setTimeout(() => { btn.textContent = "Retry Notification"; btn.disabled = false; }, 3000);
    } catch (err) {
      showFlash(`Retry failed: ${err?.message || err}`, "error");
      btn.textContent = "Retry Notification";
      btn.disabled = false;
    }
  });

  // Open ClickUp Task
  $("openClickupBtn").addEventListener("click", () => {
    const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId));
    const url = app?.clickup_task_url || app?.clickup_url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  $("openSelectedBtn").addEventListener("click", () => {
    const fallbackSelectedId = [...state.selectedIds][0] || "";
    const targetId = String(state.latestViewedApplicantId || state.selectedApplicantId || fallbackSelectedId || "");
    if (!targetId) { showFlash("Open a student first.", "warn"); return; }
    state.selectedApplicantId = targetId;
    state.latestViewedApplicantId = targetId;
    Drawer.openDrawer(ctx, targetId);
  });

  $("bulkStatusSelect").addEventListener("change", async (e) => { if (e.target.value) await Actions.bulkAction(ctx, "status", e.target.value); });
  $("bulkClassSelect").addEventListener("change", async (e) => { if (e.target.value) await Actions.bulkAction(ctx, "class", e.target.value); });
  $("bulkEmailBtn").addEventListener("click", () => { if (!state.selectedIds.size) { showFlash("No students selected.", "warn"); return; } if (!window.FSDirectEmail?.open) { showFlash("Direct email modal is not available.", "error"); return; } window.FSDirectEmail.open({ bulk: true }); });
  $("bulkExportBtn").addEventListener("click", () => Actions.exportData(ctx));
  $("bulkClearBtn").addEventListener("click", () => { state.selectedIds.clear(); Actions.updateBulkBar(ctx); renderAll(); });
}

async function boot() {
  CONFIG = AUTH_CONFIG;
  supabase = AUTH_SUPABASE;
  requireAuth = AUTH_REQUIRE_AUTH;
  ctx.supabase = supabase;
  setTheme();
  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF") || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
    window.FSAdminShell && window.FSAdminShell.mount({ active: "applicants", pageTitle: "Applicants", profileName: "Not connected" });
    $("flashArea").innerHTML = `<div class="err">Not connected - open through live server with config.js in place.</div>`;
    return;
  }
  const auth = await requireAuth(["admin", "superadmin", "principal", "regional_secretary"]);
  if (!auth) return;
  state.auth = auth;
  const tabParam = String(new URLSearchParams(window.location.search).get("tab") || "").toLowerCase();
  state.mode = tabParam === "review" ? "review" : "directory";

  window.FSDirectEmail?.init({ supabase, senderEmail: auth.profile?.email || "" });
  window.FSStudentProfile?.init({ supabase, userRole: state.auth?.profile?.role || "admin" });
  window.FSAdminShell?.mount({ active: "applicants", pageTitle: "Applicants", role: auth.profile?.role || null });

  Filters.bind(ctx, renderAll);
  wireActions();
  renderModeTabs();
  applyModeUi();
  await loadData();
}

boot().catch((e) => { $("flashArea").innerHTML = `<div class="err">Failed to load applicants: ${esc(e?.message || e)}</div>`; });
