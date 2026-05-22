let CONFIG = {};
let supabase = null;
let requireAuth = null;

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const fmt = (v) => v ? new Date(v).toLocaleString() : "-";
const ymd = (v) => v ? new Date(v).toISOString().slice(0, 10) : "";
const milestoneKeys = ["born_again", "filled_with_the_spirit", "partnership", "joined_cell", "serving_team_interest", "needs_follow_up", "foundation_completed"];
const milestoneLabels = { born_again: "Born Again", filled_with_the_spirit: "Filled with the Spirit", partnership: "Partnership", joined_cell: "Joined Cell", serving_team_interest: "Serving Team Interest", needs_follow_up: "Needs Follow-up", foundation_completed: "Foundation Completed" };
const state = { auth: null, applicants: [], classOptions: [], batches: [], notifications: [], emails: [], audits: [], moodle: [], attendance: [], filters: { search: "", fellowship: "", classOption: "", batch: "", assignment: "", notif: "", milestone: "", attendance: "", status: "", date: "" }, advFilters: { dateFrom: "", dateTo: "", moodle: "", attStatus: "", active: false }, selectedApplicantId: null, latestViewedApplicantId: null, selectedIds: new Set() };

function showFlash(msg, type = "success") { const klass = type === "error" ? "err" : type === "warn" ? "warn" : "success"; $("flashArea").innerHTML = `<div class="${klass}">${esc(msg)}</div>`; setTimeout(() => { if ($("flashArea")) $("flashArea").innerHTML = ""; }, 4200); }
const setTheme = () => { document.documentElement.setAttribute("data-theme", "light"); localStorage.setItem("fs_theme", "light"); };
const statusPill = (status) => { const normalized = String(status || "PENDING").toUpperCase(); const map = { SENT: "completed", PENDING: "attention", FAILED: "duplicate", RETRIED: "assigned" }; return `<span class="pill ${map[normalized] || "unassigned"}">${esc(normalized)}</span>`; };
const displayGroupValue = (app) => (String(app?.fellowship_code || "").toUpperCase() === "REGIONAL" && !app?.group_id ? "Regional" : (app?.group_id || "-"));
const displaySubgroupValue = (app) => (String(app?.fellowship_code || "").toUpperCase() === "REGIONAL" && !app?.subgroup_id ? "Regional" : (app?.subgroup_id || "-"));
const getApplicantMilestones = (app) => milestoneKeys.filter((k) => Boolean(app[k]));
const classIdOf = (row) => String(row?.class_option_id || row?.id || "");
const getClassInfo = (id) => state.classOptions.find((c) => classIdOf(c) === String(id || "")) || null;
function getAttendanceRows(app) { const byId = String(app.id || ""); const byEmail = String(app.email || "").toLowerCase(); return state.attendance.filter((r) => { const rid = String(r.applicant_id || r.student_id || r.registration_id || ""); const remail = String(r.email || r.student_email || "").toLowerCase(); return (byId && rid && byId === rid) || (byEmail && remail && byEmail === remail); }); }
function getAttendanceSummary(app) { const rows = getAttendanceRows(app); if (!rows.length) return { pct: null, attended: 0, total: 0, last: null, missing: 0 }; const attended = rows.filter((r) => r.present === true || String(r.present).toLowerCase() === "yes" || String(r.status).toLowerCase() === "present").length; const total = rows.length; const pct = total ? Math.round((attended / total) * 100) : 0; const last = rows.map((r) => r.created_at || r.date || r.session_date).filter(Boolean).sort().at(-1) || null; return { pct, attended, total, last, missing: Math.max(0, total - attended) }; }
function getAttendanceStatusCounts(app) { const out = { SUBMITTED: 0, LATE_START: 0, MISSING: 0 }; getAttendanceRows(app).forEach((r) => { const key = String(r.session_status || "SUBMITTED").toUpperCase(); if (key === "LATE_START" || key === "MISSING" || key === "SUBMITTED") out[key] += 1; else out.SUBMITTED += 1; }); return out; }
const attendanceStatusBadge = (label, cls, count) => count ? `<span class="pill ${cls}">${esc(label)} (${count})</span>` : "";
function getNotificationRows(app) { const byId = String(app.id || ""); const byEmail = String(app.email || "").toLowerCase(); return state.notifications.filter((n) => { const nid = String(n.applicant_id || n.student_id || ""); const nemail = String(n.recipient_email || n.email || "").toLowerCase(); return (byId && nid && byId === nid) || (byEmail && nemail && byEmail === nemail); }); }
function getNotificationState(app) { const rows = getNotificationRows(app); if (!rows.length) return "PENDING"; const order = ["FAILED", "RETRIED", "PENDING", "SENT"]; const normalized = rows.map((r) => String(r.status || r.event_status || r.provider_status || "PENDING").toUpperCase()); return order.find((stateName) => normalized.includes(stateName)) || normalized[0] || "PENDING"; }
function summarizeApplicant(app) { const milestones = getApplicantMilestones(app); const attendance = getAttendanceSummary(app); const completed = Boolean(app.foundation_completed) || milestones.length >= milestoneKeys.length; return { milestoneCount: milestones.length, attendancePct: attendance.pct, notificationState: getNotificationState(app), completed, needsFollowUp: Boolean(app.needs_follow_up || app.needs_admin_review), duplicate: Number(app.duplicate_count || 0) > 1, lastActivity: [app.updated_at, app.created_at, getNotificationRows(app)[0]?.created_at, getAttendanceRows(app)[0]?.created_at || getAttendanceRows(app)[0]?.date].filter(Boolean).sort().at(-1) || null }; }
function classifyRowStatus(app, summary) { if (summary.duplicate) return { label: "Duplicate", cls: "duplicate" }; if (summary.needsFollowUp) return { label: "Needs Attention", cls: "attention" }; if (summary.completed) return { label: "Completed", cls: "completed" }; if (app.class_option_id) return { label: "Assigned", cls: "assigned" }; return { label: "Unassigned", cls: "unassigned" }; }
function classCapacityInfo(classOptionId) { const cls = getClassInfo(classOptionId); const current = state.applicants.filter((a) => String(a.class_option_id || "") === String(classOptionId || "")).length; const max = Number(cls?.capacity || cls?.max_capacity || cls?.class_capacity || 0) || 0; return { current, max, full: max > 0 && current >= max }; }

const ctx = { state, $, esc, fmt, ymd, milestoneKeys, milestoneLabels, supabase, showFlash, classIdOf, getClassInfo, classCapacityInfo, summarizeApplicant, classifyRowStatus, getAttendanceSummary, getNotificationRows, getAttendanceStatusCounts, attendanceStatusBadge, displayGroupValue, displaySubgroupValue };
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

function renderKpis(rows) { const total = rows.length; const assigned = rows.filter((a) => Boolean(a.class_option_id)).length; const unassigned = total - assigned; const duplicates = rows.filter((a) => Number(a.duplicate_count || 0) > 1).length; const needsAttention = rows.filter((a) => summarizeApplicant(a).needsFollowUp).length; const classCapacityAlerts = state.classOptions.filter((c) => { const id = classIdOf(c); if (!id) return false; const cap = classCapacityInfo(id); return cap.max > 0 && cap.current >= cap.max; }).length; const items = [["Total Registrants", total, "All visible records"], ["Assigned Students", assigned, `${total ? Math.round((assigned / total) * 100) : 0}% assigned`], ["Unassigned Students", unassigned, "Need class placement"], ["Duplicates", duplicates, "Potential data merge review"], ["Needs Attention", needsAttention, "Follow-up required"], ["Class Capacity Alerts", classCapacityAlerts, "Classes at or above capacity"]]; $("kpiGrid").innerHTML = items.map(([l, v, s]) => `<article class="card"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${esc(v)}</div><div class="kpi-sub">${esc(s)}</div></article>`).join(""); }

function renderTable(rows) {
  const classMap = new Map(state.classOptions.map((c) => [classIdOf(c), c]));
  $("tableWrap").innerHTML = `<table><thead><tr><th style="width:32px"><input type="checkbox" id="selectAllChk" style="cursor:pointer;width:16px;height:16px" /></th><th>Student</th><th>Fellowship</th><th>Assigned Class</th><th>Teacher</th><th>Batch</th><th>Milestone Progress</th><th>Attendance %</th><th>Notification State</th><th>Last Activity</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map((app) => { const summary = summarizeApplicant(app); const cls = classMap.get(String(app.class_option_id || "")); const rowStatus = classifyRowStatus(app, summary); const checked = state.selectedIds.has(String(app.id)) ? "checked" : ""; return `<tr><td style="width:32px;padding:8px"><input type="checkbox" class="row-chk" data-id="${esc(app.id)}" ${checked} style="cursor:pointer;width:16px;height:16px" /></td><td class="student-cell"><div class="name">${esc(app.full_name || "-")}</div><div class="sub">${esc(app.email || "-")} · ${esc(app.phone || app.phone_number || "-")}</div></td><td>${esc(app.fellowship_code || app.fellowship || app.subgroup_id || "-")}</td><td>${esc(app.class_option_id || "-")}</td><td>${esc(cls?.teacher_name || cls?.teacher_id || "-")}</td><td>${esc(app.batch_id || cls?.batch_id || "-")}</td><td>${Math.round((summary.milestoneCount / milestoneKeys.length) * 100)}%</td><td>${summary.attendancePct == null ? "-" : `${summary.attendancePct}%`}</td><td>${statusPill(summary.notificationState)}</td><td>${esc(fmt(summary.lastActivity))}</td><td><span class="pill ${rowStatus.cls}">${esc(rowStatus.label)}</span></td><td><div class="btns"><button class="btn" data-open="${esc(app.id)}">Open</button><button class="btn" data-profile="${esc(app.id)}">Profile</button><button class="btn" data-direct-email="${esc(app.id)}">Email</button></div></td></tr>`; }).join("") || `<tr><td colspan="12" class="muted">No registrants match the current filters.</td></tr>`}</tbody></table>`;
  document.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => Drawer.openDrawer(ctx, btn.getAttribute("data-open"))));
  document.querySelectorAll("[data-direct-email]").forEach((btn) => btn.addEventListener("click", () => Actions.sendEmail(ctx, btn.getAttribute("data-direct-email"))));
  document.querySelectorAll("[data-profile]").forEach((btn) => btn.addEventListener("click", () => window.FSStudentProfile?.open(btn.getAttribute("data-profile"))));
}

function renderAll() {
  const rows = Filters.applyFilters(ctx);
  renderKpis(rows); renderTable(rows); $("rowMeta").textContent = `${rows.length} of ${state.applicants.length} registrants shown`;
  document.querySelectorAll(".row-chk").forEach((chk) => chk.addEventListener("change", () => { chk.checked ? state.selectedIds.add(chk.dataset.id) : state.selectedIds.delete(chk.dataset.id); Actions.updateBulkBar(ctx); }));
  const allChk = $("selectAllChk");
  if (allChk) { allChk.checked = rows.length > 0 && rows.every((a) => state.selectedIds.has(String(a.id))); allChk.addEventListener("change", () => { if (allChk.checked) rows.forEach((a) => state.selectedIds.add(String(a.id))); else state.selectedIds.clear(); renderAll(); }); }
  Actions.updateBulkBar(ctx);
}
ctx.filteredApplicants = () => Filters.applyFilters(ctx);

async function safeLoad(queryFn, fallback = []) { try { return await queryFn(); } catch { return fallback; } }
async function loadData() {
  const [applicants, classOptions, batches, notifications, emails, audits, moodle, attendance] = await Promise.all([
    safeLoad(async () => (await supabase.from("applicants").select("*").order("created_at", { ascending: false }).limit(3000)).data || []),
    safeLoad(async () => (await supabase.from("class_options").select("*").limit(3000)).data || []),
    safeLoad(async () => (await supabase.from("batches").select("batch_id,batch_name,start_sunday,status,active").limit(500)).data || []),
    safeLoad(async () => (await supabase.from("notification_events").select("*").order("created_at", { ascending: false }).limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("email_queue").select("*").order("created_at", { ascending: false }).limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("moodle_sync").select("*").limit(5000)).data || []),
    safeLoad(async () => (await supabase.from("attendance_log").select("*").order("created_at", { ascending: false }).limit(10000)).data || []),
  ]);
  Object.assign(state, { applicants, classOptions, batches, notifications, emails, audits, moodle, attendance });
  Filters.renderFilters(ctx); renderAll();
}
ctx.loadData = loadData;

function wireActions() {
  $("refreshBtnTop").addEventListener("click", loadData); $("refreshBtn").addEventListener("click", loadData);
  $("drawerOverlay").addEventListener("click", () => Drawer.closeDrawer(ctx)); $("closeDrawerBtn").addEventListener("click", () => Drawer.closeDrawer(ctx));
  $("sendEmailBtn").addEventListener("click", () => Actions.sendEmail(ctx, state.selectedApplicantId));
  $("openAttendanceBtn").addEventListener("click", () => { window.location.href = "/foundation/staff/TeacherAttendancePortal.html"; });
  $("openMilestonesBtn").addEventListener("click", () => { window.location.href = "/foundation/staff/StudentProgressView.html"; });
  $("openClickupBtn").addEventListener("click", () => { const app = state.applicants.find((a) => String(a.id) === String(state.selectedApplicantId)); const url = app?.clickup_task_url || app?.clickup_url; if (url) window.open(url, "_blank", "noopener,noreferrer"); });
  $("openSelectedBtn").addEventListener("click", () => state.latestViewedApplicantId ? Drawer.openDrawer(ctx, state.latestViewedApplicantId) : showFlash("Open a student first.", "warn"));
  $("bulkStatusSelect").addEventListener("change", async (e) => { if (e.target.value) await Actions.bulkAction(ctx, "status", e.target.value); });
  $("bulkClassSelect").addEventListener("change", async (e) => { if (e.target.value) await Actions.bulkAction(ctx, "class", e.target.value); });
  $("bulkEmailBtn").addEventListener("click", () => { if (!state.selectedIds.size) { showFlash("No students selected.", "warn"); return; } if (!window.FSDirectEmail?.open) { showFlash("Direct email modal is not available.", "error"); return; } window.FSDirectEmail.open({ bulk: true }); });
  $("bulkExportBtn").addEventListener("click", () => Actions.exportData(ctx));
  $("bulkClearBtn").addEventListener("click", () => { state.selectedIds.clear(); Actions.updateBulkBar(ctx); renderAll(); });
}

async function boot() {
  const authClient = await import("../auth/auth-client.js");
  CONFIG = authClient.CONFIG;
  supabase = authClient.supabase;
  requireAuth = authClient.requireAuth;
  ctx.supabase = supabase;
  setTheme();
  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF") || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
    window.FSAdminShell && window.FSAdminShell.mount({ active: "applicants", pageTitle: "Applicant Directory", profileName: "Not connected" });
    $("flashArea").innerHTML = `<div class="err">? Not connected — open this page through a live server with config.js in place to load data</div>`;
    return;
  }
  const auth = await requireAuth(["admin", "superadmin", "principal", "regional_secretary"]); if (!auth) return;
  state.auth = auth;
  window.FSDirectEmail?.init({ supabase, senderEmail: auth.profile?.email || "" });
  window.FSStudentProfile?.init({ supabase, userRole: auth.profile?.role || "" });
  window.FSAdminShell?.mount({ active: "applicants", pageTitle: "Applicant Directory", role: auth.profile?.role || null });
  Filters.bind(ctx, renderAll); wireActions(); await loadData();
}

boot().catch((e) => { $("flashArea").innerHTML = `<div class="err">Failed to load directory: ${esc(e?.message || e)}</div>`; });


