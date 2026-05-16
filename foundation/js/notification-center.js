import { supabase, getCurrentProfile } from "../auth/auth-client.js";
import { requireAuth } from "../auth/auth-client.js";
import { logout } from "../auth/logout.js";

const AdminApi = window.FSAdminApi;
const AdminUi = window.FSAdminUi;

const state = {
  rows: [],
  filtered: [],
  summary: {
    pendingEmails: 0,
    failedEmails: 0,
    pendingMoodle: 0,
    failedMoodle: 0,
  },
  filters: {
    status: "",
    type: "",
    date: "",
    search: "",
  },
  selected: new Set(),
  profile: null,
  detailsOpen: null,
  busy: false,
  inFlightKeys: new Set(),
};

const PAGE_SIZE = 25;
let page = 1;

const $ = (id) => document.getElementById(id);

function esc(v) {
  return AdminUi ? AdminUi.esc(v) : String(v ?? "");
}

function fmtDate(v) {
  if (!v) return "�";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function ymd(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toast(msg, type = "info") {
  if (window.FSToast?.[type]) {
    window.FSToast[type](msg);
    return;
  }
  const host = $("toast");
  if (!host) return;
  host.textContent = msg;
  host.className = `ops-toast show ${type}`;
  setTimeout(() => host.classList.remove("show"), 3200);
}

function setError(msg) {
  const n = $("errorBox");
  if (!n) return;
  if (!msg) {
    n.classList.add("hidden");
    n.textContent = "";
    return;
  }
  n.textContent = msg;
  n.classList.remove("hidden");
}

function setLoading(loading, text = "Loading operational data�") {
  state.busy = !!loading;
  $("loadingState").textContent = text;
  $("loadingState").classList.toggle("hidden", !loading);
  $("tableWrap").classList.toggle("hidden", loading);
  $("refreshBtn").disabled = !!loading;
  $("retrySelectedBtn").disabled = !!loading;
  $("resolveSelectedBtn").disabled = !!loading;
}

function sourceLabel(type) {
  switch (type) {
    case "email_queue": return "Email Queue";
    case "scheduled_notifications": return "Scheduled Notification";
    case "moodle_sync": return "Moodle Sync";
    case "moodle_enrollment_sync": return "Moodle Enrollment Sync";
    case "failed_syncs": return "Failed Sync";
    default: return type;
  }
}

function chip(status) {
  const s = String(status || "").toLowerCase();
  let cls = "chip info";
  if (s.includes("fail") || s.includes("error")) cls = "chip bad";
  else if (s.includes("pending") || s.includes("retry")) cls = "chip warn";
  else if (s.includes("sent") || s.includes("resolved") || s.includes("success")) cls = "chip good";
  return `<span class="${cls}">${esc(status || "�")}</span>`;
}

async function selectSafe(table, query) {
  try {
    const { data, error } = await query(supabase.from(table));
    if (error) throw error;
    return data || [];
  } catch (e) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("relation") || e?.code === "42P01") {
      return [];
    }
    throw e;
  }
}

function normalizeEmailRows(rows) {
  return rows.map((r) => ({
    id: String(r.id),
    source: "email_queue",
    type: "email",
    status: String(r.status || "").toUpperCase() || "UNKNOWN",
    recipient: r.recipient_email || "",
    subject: r.subject || r.template_key || "",
    action: "Email Delivery",
    error: r.error_message || r.last_error || "",
    created_at: r.created_at || r.updated_at,
    raw: r,
  }));
}

function normalizeScheduledRows(rows) {
  return rows.map((r) => ({
    id: String(r.id),
    source: "scheduled_notifications",
    type: (String(r.event_type || "").toUpperCase().includes("MOODLE") ? "moodle" : "notification"),
    status: String(r.status || "").toUpperCase() || "UNKNOWN",
    recipient: r.recipient_email || "",
    subject: r.template_key || r.event_type || "",
    action: r.event_type || "Scheduled Notification",
    error: r.error_message || r.last_error || "",
    created_at: r.created_at || r.updated_at || r.scheduled_for,
    raw: r,
  }));
}

function normalizeFailedSyncRows(rows) {
  return rows.map((r) => ({
    id: String(r.id),
    source: "failed_syncs",
    type: String(r.sync_type || "").toLowerCase().includes("moodle") ? "moodle" : "sync",
    status: String(r.status || "FAILED").toUpperCase(),
    recipient: "",
    subject: r.source_table || r.sync_type || "",
    action: r.sync_type || "Failed Sync",
    error: r.error_message || "",
    created_at: r.created_at || r.last_retry_at,
    raw: r,
  }));
}

function normalizeMoodleRows(rows) {
  return rows.map((r) => ({
    id: String(r.id),
    source: "moodle_enrollment_sync",
    type: "moodle",
    status: String(r.sync_status || r.status || "PENDING").toUpperCase(),
    recipient: r.email || r.student_email || "",
    subject: `Applicant ${r.applicant_id || ""} / Student ${r.student_id || ""}`,
    action: "Moodle Enrollment Sync",
    error: r.error_message || r.last_error || "",
    created_at: r.updated_at || r.last_attempt_at || r.created_at || r.synced_at,
    raw: r,
  }));
}

async function loadData() {
  setError("");
  setLoading(true);

  try {
    const [emailRows, scheduledRows, failedSyncRows, moodleRows] = await Promise.all([
      selectSafe("email_queue", (q) =>
        q.select("id,recipient_email,template_key,subject,status,error_message,last_error,created_at,updated_at")
          .order("created_at", { ascending: false })
          .limit(1000)
      ),
      selectSafe("scheduled_notifications", (q) =>
        q.select("id,recipient_email,event_type,template_key,status,error_message,last_error,created_at,updated_at,scheduled_for")
          .order("created_at", { ascending: false })
          .limit(1000)
      ),
      selectSafe("failed_syncs", (q) =>
        q.select("id,sync_type,source_table,status,error_message,created_at,last_retry_at")
          .order("created_at", { ascending: false })
          .limit(600)
      ),
      selectSafe("moodle_enrollment_sync", (q) =>
        q.select("id,applicant_id,student_id,email,sync_status,error_message,last_error,error_code,last_attempt_at,updated_at,created_at,synced_at")
          .order("updated_at", { ascending: false })
          .limit(600)
      ),
    ]);

    const merged = [
      ...normalizeEmailRows(emailRows),
      ...normalizeScheduledRows(scheduledRows),
      ...normalizeFailedSyncRows(failedSyncRows),
      ...normalizeMoodleRows(moodleRows),
    ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    state.rows = merged;
    computeSummary();
    applyFilters();
    render();
  } catch (e) {
    setError(AdminApi?.normalizeError(e) || String(e));
  } finally {
    setLoading(false);
  }
}

function computeSummary() {
  const isFail = (s) => String(s || "").toLowerCase().includes("fail") || String(s || "").toLowerCase().includes("error");
  const isPending = (s) => String(s || "").toLowerCase().includes("pending") || String(s || "").toLowerCase().includes("retry");

  state.summary.pendingEmails = state.rows.filter((r) => r.type === "email" && isPending(r.status)).length;
  state.summary.failedEmails = state.rows.filter((r) => r.type === "email" && isFail(r.status)).length;
  state.summary.pendingMoodle = state.rows.filter((r) => r.type === "moodle" && isPending(r.status)).length;
  state.summary.failedMoodle = state.rows.filter((r) => r.type === "moodle" && isFail(r.status)).length;
}

function applyFilters() {
  const { status, type, date, search } = state.filters;
  const q = search.trim().toLowerCase();

  state.filtered = state.rows.filter((r) => {
    if (status && String(r.status).toUpperCase() !== status) return false;
    if (type && r.type !== type) return false;
    if (date && ymd(r.created_at) !== date) return false;
    if (q) {
      const hay = `${r.recipient} ${r.subject} ${r.action} ${r.error}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const max = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  page = Math.min(page, max);
}

function renderSummary() {
  $("sumPendingEmails").textContent = String(state.summary.pendingEmails);
  $("sumFailedEmails").textContent = String(state.summary.failedEmails);
  $("sumPendingMoodle").textContent = String(state.summary.pendingMoodle);
  $("sumFailedMoodle").textContent = String(state.summary.failedMoodle);
}

function rowActions(r) {
  const fail = String(r.status || "").toLowerCase().includes("fail") || String(r.status || "").toLowerCase().includes("error");
  const canRetry = fail || String(r.status || "").toLowerCase().includes("pending");
  return `
    <div class="actions">
      ${canRetry ? `<button class="btn btn-xs" data-act="retry" data-source="${esc(r.source)}" data-id="${esc(r.id)}">Retry</button>` : ""}
      <button class="btn btn-xs" data-act="resolve" data-source="${esc(r.source)}" data-id="${esc(r.id)}">Resolve</button>
      <button class="btn btn-xs" data-act="details" data-source="${esc(r.source)}" data-id="${esc(r.id)}">Details</button>
    </div>`;
}

function renderTable() {
  const count = state.filtered.length;
  $("rowCount").textContent = `${count} row${count === 1 ? "" : "s"}`;

  const max = Math.max(1, Math.ceil(count / PAGE_SIZE));
  $("pageInfo").textContent = `Page ${page} of ${max}`;
  $("prevBtn").disabled = page <= 1;
  $("nextBtn").disabled = page >= max;

  const start = (page - 1) * PAGE_SIZE;
  const rows = state.filtered.slice(start, start + PAGE_SIZE);

  if (!rows.length) {
    $("rows").innerHTML = `<tr><td colspan="9" class="state-cell">No operational records match the current filters.</td></tr>`;
    return;
  }

  $("rows").innerHTML = rows.map((r) => {
    const key = `${r.source}:${r.id}`;
    return `
      <tr>
        <td><input type="checkbox" data-key="${esc(key)}" ${state.selected.has(key) ? "checked" : ""}></td>
        <td>${esc(sourceLabel(r.source))}</td>
        <td>${esc(r.type)}</td>
        <td>${esc(r.recipient || "�")}</td>
        <td>${esc(r.subject || "�")}</td>
        <td>${chip(r.status)}</td>
        <td class="muted-cell" title="${esc(r.error || "")}">${esc(r.error || "�")}</td>
        <td>${fmtDate(r.created_at)}</td>
        <td>${rowActions(r)}</td>
      </tr>`;
  }).join("");
}

function renderDetails() {
  const box = $("detailsBox");
  if (!state.detailsOpen) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="details-head">
      <h3>Error Details</h3>
      <button class="btn btn-xs" id="closeDetails">Close</button>
    </div>
    <pre>${esc(JSON.stringify(state.detailsOpen.raw, null, 2))}</pre>`;
  $("closeDetails").addEventListener("click", () => {
    state.detailsOpen = null;
    renderDetails();
  });
}

function render() {
  renderSummary();
  renderTable();
  renderDetails();
}

function findRow(source, id) {
  return state.rows.find((r) => r.source === source && String(r.id) === String(id));
}

async function invokeRetryWorker(action, source, id) {
  const payload = { action, source, id };
  const invokePromise = supabase.functions.invoke("retry-worker", { body: payload });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Retry worker timed out after 20s")), 20000);
  });
  const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Retry worker failed");
  return data;
}

async function onRetry(source, id) {
  const opKey = `retry:${source}:${id}`;
  if (state.inFlightKeys.has(opKey)) {
    toast("Retry already in progress for this row.", "warning");
    return;
  }
  state.inFlightKeys.add(opKey);
  try {
    await invokeRetryWorker("retry", source, id);
    toast("Retry queued", "success");
    await loadData();
  } catch (e) {
    toast(`Retry failed: ${AdminApi?.normalizeError(e) || e}`, "error");
  } finally {
    state.inFlightKeys.delete(opKey);
  }
}

async function onResolve(source, id) {
  const opKey = `resolve:${source}:${id}`;
  if (state.inFlightKeys.has(opKey)) {
    toast("Resolve already in progress for this row.", "warning");
    return;
  }
  state.inFlightKeys.add(opKey);
  try {
    await invokeRetryWorker("resolve", source, id);
    toast("Marked resolved", "success");
    await loadData();
  } catch (e) {
    toast(`Resolve failed: ${AdminApi?.normalizeError(e) || e}`, "error");
  } finally {
    state.inFlightKeys.delete(opKey);
  }
}

async function onBulk(action) {
  if (state.busy) {
    toast("Please wait for current operation to finish.", "warning");
    return;
  }
  const keys = [...state.selected];
  if (!keys.length) {
    toast("Select at least one row.", "warning");
    return;
  }

  setLoading(true, action === "retry" ? "Retrying selected rows..." : "Resolving selected rows...");
  let ok = 0;
  try {
    for (const k of keys) {
      const [source, id] = k.split(":");
      try {
        await invokeRetryWorker(action, source, id);
        ok += 1;
      } catch (_) {
        // continue other rows
      }
    }

    toast(`${action === "retry" ? "Retried" : "Resolved"} ${ok}/${keys.length} records.`, ok ? "success" : "error");
    await loadData();
  } finally {
    setLoading(false);
  }
}

function wireEvents() {
  $("refreshBtn").addEventListener("click", loadData);
  $("logoutBtn").addEventListener("click", logout);

  $("statusFilter").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    page = 1;
    applyFilters();
    renderTable();
  });
  $("typeFilter").addEventListener("change", (e) => {
    state.filters.type = e.target.value;
    page = 1;
    applyFilters();
    renderTable();
  });
  $("dateFilter").addEventListener("change", (e) => {
    state.filters.date = e.target.value;
    page = 1;
    applyFilters();
    renderTable();
  });
  $("searchInput").addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    page = 1;
    applyFilters();
    renderTable();
  });

  $("prevBtn").addEventListener("click", () => {
    page = Math.max(1, page - 1);
    renderTable();
  });
  $("nextBtn").addEventListener("click", () => {
    const max = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    page = Math.min(max, page + 1);
    renderTable();
  });

  $("rows").addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.hasAttribute("data-key")) return;
    const key = target.getAttribute("data-key");
    if (!key) return;
    if (target.checked) state.selected.add(key);
    else state.selected.delete(key);
  });

  $("rows").addEventListener("click", async (e) => {
    if (state.busy) return;
    if (state.busy) return;
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const action = btn.getAttribute("data-act");
    const source = btn.getAttribute("data-source");
    const id = btn.getAttribute("data-id");
    if (!action || !source || !id) return;

    if (action === "details") {
      state.detailsOpen = findRow(source, id) || null;
      renderDetails();
      return;
    }
    if (action === "retry") {
      await onRetry(source, id);
      return;
    }
    if (action === "resolve") {
      await onResolve(source, id);
    }
  });

  $("retrySelectedBtn").addEventListener("click", () => onBulk("retry"));
  $("resolveSelectedBtn").addEventListener("click", () => onBulk("resolve"));
}

async function bootShell(profile) {
  if (!window.FSAdminShell?.mount) return;
  window.FSAdminShell.mount({
    active: "notifications",
    role: profile.role,
    profileName: profile.full_name || profile.email || "Admin",
    breadcrumbs: [{ label: "Admin", href: "admin-dashboard.html" }, { label: "Notifications" }],
    onLogout: logout,
  });
}

(async function boot() {
  try {
    const auth = await requireAuth(["admin", "superadmin", "subgroup_admin", "pastor"]);
    if (!auth) return;
    state.profile = await getCurrentProfile();

    $("whoami").textContent = `${state.profile?.email || ""} (${state.profile?.role || ""})`;

    await bootShell(state.profile);
    wireEvents();
    await loadData();
  } catch (e) {
    setError(AdminApi?.normalizeError(e) || String(e));
    setLoading(false);
  }
})();








