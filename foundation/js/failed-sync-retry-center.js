import { supabase, getCurrentProfile, isAdmin } from "../auth/auth-client.js";

const adminApi = window.FSAdminApi;
const adminUi = window.FSAdminUi;

const state = {
  profile: null,
  jobs: [],
  filtered: [],
  selected: new Set(),
  loading: false,
  filters: {
    type: "all",
    status: "all",
    from: "",
    to: "",
    q: ""
  }
};

const $ = (id) => document.getElementById(id);

function isMissingTable(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

function pick(obj, keys, fallback = "-") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return fallback;
}

function showBanner(kind, text) {
  const id = kind === "error" ? "errorBox" : kind === "ok" ? "okBox" : "infoBox";
  ["errorBox", "okBox", "infoBox"].forEach((x) => {
    const el = $(x);
    if (el) el.classList.add("hidden");
  });
  const box = $(id);
  if (!box) return;
  box.textContent = text;
  box.classList.remove("hidden");
}

function clearBanner() {
  ["errorBox", "okBox", "infoBox"].forEach((x) => {
    const el = $(x);
    if (el) el.classList.add("hidden");
  });
}

function fmtDateTime(v) {
  if (!v || v === "-") return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function typeBadge(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("moodle")) return "Moodle";
  if (t.includes("mailchimp")) return "Mailchimp";
  if (t.includes("email") || t.includes("notification")) return "Email";
  return "Sync";
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("fail") || s.includes("error")) return "bad";
  if (s.includes("pending") || s.includes("retry")) return "warn";
  return "info";
}

function normalizeJob(source, row, fallbackType) {
  const status = String(pick(row, ["status", "sync_status"], "Unknown"));
  const error = String(pick(row, ["error_message", "last_error", "failure_reason"], "-"));
  const retryCount = Number(pick(row, ["retry_count", "attempts", "sync_attempts"], 0)) || 0;
  const createdAt = pick(row, ["created_at", "occurred_at", "logged_at"], "-");
  const updatedAt = pick(row, ["updated_at", "last_retry_at", "sent_at"], "-");
  const recipient = String(pick(row, ["recipient_email", "email", "recipient_name", "student_id", "applicant_id"], "-"));

  return {
    source,
    id: String(pick(row, ["id", "queue_id", "sync_id"], "")),
    type: fallbackType,
    recipient,
    status,
    error,
    failureReason: String(row?.failure_reason || ""),
    traceId: String(
      row?.trace_id ||
      row?.payload?.trace_id ||
      row?.metadata?.trace_id ||
      row?.details?.trace_id ||
      row?.raw_data?.trace_id ||
      ""
    ),
    createdAt,
    lastAttemptedAt: updatedAt,
    retryCount,
    raw: row
  };
}

async function loadTableJobs() {
  const missing = [];

  const loadFailedSyncs = async () => {
    const { data, error } = await supabase
      .from("failed_syncs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingTable(error)) {
        missing.push("failed_syncs");
        return [];
      }
      throw error;
    }
    return (data || []).map((r) => normalizeJob("failed_syncs", r, typeBadge(pick(r, ["sync_type", "source_table", "provider"], "sync"))));
  };

  const loadFailedEmails = async () => {
    const { data, error } = await supabase
      .from("email_queue")
      .select("*")
      .or("status.ilike.%fail%,status.ilike.%error%")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingTable(error)) {
        missing.push("email_queue");
        return [];
      }
      throw error;
    }
    return (data || []).map((r) => normalizeJob("email_queue", r, "Email"));
  };

  const loadFailedScheduled = async () => {
    const { data, error } = await supabase
      .from("scheduled_notifications")
      .select("*")
      .or("status.ilike.%fail%,status.ilike.%error%")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingTable(error)) {
        missing.push("scheduled_notifications");
        return [];
      }
      throw error;
    }
    return (data || []).map((r) => normalizeJob("scheduled_notifications", r, "Email"));
  };

  const loadMoodle = async () => {
    const { data, error } = await supabase
      .from("moodle_enrollment_sync")
      .select("*")
      .or("sync_status.ilike.%fail%,sync_status.ilike.%error%,sync_status.ilike.%retry%,status.ilike.%retry%,last_error.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingTable(error)) {
        missing.push("moodle_enrollment_sync");
        return [];
      }
      return [];
    }
    return (data || []).map((r) => normalizeJob("moodle_enrollment_sync", r, "Moodle"));
  };

  const [a, b, c, d] = await Promise.all([loadFailedSyncs(), loadFailedEmails(), loadFailedScheduled(), loadMoodle()]);
  return { jobs: [...a, ...b, ...c, ...d], missing };
}

function applyFilters() {
  const q = state.filters.q.trim().toLowerCase();
  const fromMs = state.filters.from ? new Date(state.filters.from + "T00:00:00").getTime() : null;
  const toMs = state.filters.to ? new Date(state.filters.to + "T23:59:59").getTime() : null;

  state.filtered = state.jobs.filter((j) => {
    if (state.filters.type !== "all" && String(j.type).toLowerCase() !== state.filters.type) return false;
    if (state.filters.status !== "all" && String(j.status).toLowerCase() !== state.filters.status) return false;

    const when = new Date(j.createdAt || j.lastAttemptedAt || 0).getTime();
    if (fromMs && Number.isFinite(when) && when < fromMs) return false;
    if (toMs && Number.isFinite(when) && when > toMs) return false;

    if (q) {
      const hay = `${j.type} ${j.recipient} ${j.status} ${j.error} ${j.source}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

function updateSummary() {
  const total = state.jobs.length;
  const failedEmails = state.jobs.filter((j) => j.source === "email_queue" || j.source === "scheduled_notifications").length;
  const failedMoodle = state.jobs.filter((j) => String(j.type).toLowerCase() === "moodle").length;
  const failedMailchimp = state.jobs.filter((j) => String(j.type).toLowerCase() === "mailchimp").length;

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
  const retriesToday = state.jobs.filter((j) => {
    const t = new Date(j.lastAttemptedAt || 0).getTime();
    return Number.isFinite(t) && t >= start && t <= end && j.retryCount > 0;
  }).length;

  $("kTotal").textContent = String(total);
  $("kEmails").textContent = String(failedEmails);
  $("kMoodle").textContent = String(failedMoodle);
  $("kMailchimp").textContent = String(failedMailchimp);
  $("kRetriesToday").textContent = String(retriesToday);
  $("summaryLine").textContent = `${state.filtered.length} visible of ${total} total failed jobs`;
}

function renderRows() {
  const tbody = $("rows");
  const cards = $("mobileCards");

  if (!state.filtered.length) {
    $("emptyState").classList.remove("hidden");
    $("tableWrap").classList.add("hidden");
    cards.innerHTML = "";
    return;
  }

  $("emptyState").classList.add("hidden");
  $("tableWrap").classList.remove("hidden");

  tbody.innerHTML = state.filtered.map((j) => {
    const key = `${j.source}:${j.id}`;
    return `
      <tr>
        <td><input type="checkbox" class="row-check" data-key="${adminUi.esc(key)}" ${state.selected.has(key) ? "checked" : ""}></td>
        <td><span class="chip info">${adminUi.esc(j.type)}</span></td>
        <td>${adminUi.esc(j.recipient)}</td>
        <td>
          ${j.traceId ? `<code>${adminUi.esc(j.traceId.slice(0, 8))}...${adminUi.esc(j.traceId.slice(-6))}</code> <button class="btn btn-sm js-copy-trace" data-trace="${adminUi.esc(j.traceId)}">Copy</button>` : "<span class=\"muted\">-</span>"}
        </td>
        <td><span class="chip ${statusClass(j.status)}">${adminUi.esc(j.status)}</span></td>
        <td>${j.failureReason ? `<span class="chip info">${adminUi.esc(j.failureReason.replace(/^MOODLE_/, ""))}</span>` : ""}</td>
        <td class="muted-cell" title="${adminUi.esc(j.error)}">${adminUi.esc(j.error)}</td>
        <td>${adminUi.esc(fmtDateTime(j.createdAt))}</td>
        <td>${adminUi.esc(fmtDateTime(j.lastAttemptedAt))}</td>
        <td>${adminUi.esc(String(j.retryCount))}</td>
        <td>
          <div class="actions-inline">
            <button class="btn btn-sm js-retry" data-key="${adminUi.esc(key)}">Retry</button>
            <button class="btn btn-sm js-resolve" data-key="${adminUi.esc(key)}">Resolve</button>
            <button class="btn btn-sm js-details" data-key="${adminUi.esc(key)}">Details</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  cards.innerHTML = state.filtered.map((j) => {
    const key = `${j.source}:${j.id}`;
    return `
      <article class="ops-mobile-card">
        <header>
          <label><input type="checkbox" class="row-check" data-key="${adminUi.esc(key)}" ${state.selected.has(key) ? "checked" : ""}> ${adminUi.esc(j.recipient)}</label>
          <span class="chip ${statusClass(j.status)}">${adminUi.esc(j.status)}</span>
        </header>
        <div class="ops-mobile-meta"><strong>Type:</strong> ${adminUi.esc(j.type)}</div>
        <div class="ops-mobile-meta"><strong>Trace:</strong> ${j.traceId ? `${adminUi.esc(j.traceId.slice(0, 8))}...${adminUi.esc(j.traceId.slice(-6))} <button class="btn btn-sm js-copy-trace" data-trace="${adminUi.esc(j.traceId)}">Copy</button>` : "-"}</div>
        ${j.failureReason ? `<div class="ops-mobile-meta"><strong>Cause:</strong> ${adminUi.esc(j.failureReason.replace(/^MOODLE_/, ""))}</div>` : ""}
        <div class="ops-mobile-meta"><strong>Error:</strong> ${adminUi.esc(j.error)}</div>
        <div class="ops-mobile-meta"><strong>Created:</strong> ${adminUi.esc(fmtDateTime(j.createdAt))}</div>
        <div class="ops-mobile-meta"><strong>Last Attempt:</strong> ${adminUi.esc(fmtDateTime(j.lastAttemptedAt))}</div>
        <div class="ops-mobile-meta"><strong>Retry Count:</strong> ${adminUi.esc(String(j.retryCount))}</div>
        <div class="actions-inline">
          <button class="btn btn-sm js-retry" data-key="${adminUi.esc(key)}">Retry</button>
          <button class="btn btn-sm js-resolve" data-key="${adminUi.esc(key)}">Resolve</button>
          <button class="btn btn-sm js-details" data-key="${adminUi.esc(key)}">Details</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderMissingNotes(missing) {
  const notes = $("migrationNotes");
  if (!missing.length) {
    notes.innerHTML = "<li>No missing-table migrations detected for this view.</li>";
    return;
  }
  notes.innerHTML = missing.map((m) => `<li>Missing optional/required table: ${adminUi.esc(m)}</li>`).join("");
}

function getJobByKey(key) {
  const [source, id] = String(key || "").split(":");
  return state.jobs.find((j) => j.source === source && String(j.id) === String(id));
}

async function auditRetry(action, job) {
  const payload = {
    actor_email: state.profile?.email || null,
    action,
    entity_type: job.source,
    entity_id: String(job.id),
    status: "SUCCESS",
    details: {
      type: job.type,
      recipient: job.recipient,
      status: job.status,
      retry_count: job.retryCount,
      trace_id: job.traceId || null
    },
    logged_at: new Date().toISOString()
  };

  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error && !isMissingTable(error)) return;
}

async function runActionOnJob(action, job) {
  const payload = { action, source: job.source, id: String(job.id) };
  const res = await adminApi.invokeRetryWorker(supabase, payload);
  await auditRetry(action === "retry" ? "RETRY_REQUESTED" : "RETRY_MARK_RESOLVED", job);
  return res;
}

async function runBulk(action, jobs) {
  if (!jobs.length) return;
  const label = action === "retry" ? "Retrying" : "Resolving";
  showBanner("info", `${label} ${jobs.length} job(s)...`);
  let okCount = 0;
  for (const j of jobs) {
    try {
      await runActionOnJob(action, j);
      okCount += 1;
    } catch (_) {
      // continue
    }
  }
  showBanner(okCount === jobs.length ? "ok" : "error", `${label} complete: ${okCount}/${jobs.length} successful.`);
  await refresh();
}

function openDetails(job) {
  $("detailTitle").textContent = `${job.type} - ${job.source}`;
  $("detailBody").textContent = JSON.stringify(job.raw, null, 2);
  $("detailError").textContent = job.error || "-";
  $("detailOverlay").classList.add("open");
}

async function refresh() {
  clearBanner();
  state.loading = true;
  $("loadingState").classList.remove("hidden");

  try {
    const { jobs, missing } = await loadTableJobs();
    state.jobs = jobs.sort((a, b) => new Date(b.lastAttemptedAt || b.createdAt || 0).getTime() - new Date(a.lastAttemptedAt || a.createdAt || 0).getTime());
    applyFilters();
    updateSummary();
    renderRows();
    renderMissingNotes(missing);
  } catch (e) {
    showBanner("error", `Failed to load failed jobs: ${adminApi.normalizeError(e)}`);
    $("tableWrap").classList.add("hidden");
    $("emptyState").classList.remove("hidden");
  } finally {
    state.loading = false;
    $("loadingState").classList.add("hidden");
  }
}

function wireEvents() {
  $("refreshBtn").addEventListener("click", refresh);

  $("filterType").addEventListener("change", (e) => {
    state.filters.type = String(e.target.value || "all");
    applyFilters();
    updateSummary();
    renderRows();
  });
  $("filterStatus").addEventListener("change", (e) => {
    state.filters.status = String(e.target.value || "all");
    applyFilters();
    updateSummary();
    renderRows();
  });
  $("filterFrom").addEventListener("change", (e) => {
    state.filters.from = String(e.target.value || "");
    applyFilters();
    updateSummary();
    renderRows();
  });
  $("filterTo").addEventListener("change", (e) => {
    state.filters.to = String(e.target.value || "");
    applyFilters();
    updateSummary();
    renderRows();
  });
  $("searchInput").addEventListener("input", (e) => {
    state.filters.q = String(e.target.value || "");
    applyFilters();
    updateSummary();
    renderRows();
  });

  $("selectAll").addEventListener("change", (e) => {
    const checked = !!e.target.checked;
    state.selected.clear();
    if (checked) state.filtered.forEach((j) => state.selected.add(`${j.source}:${j.id}`));
    renderRows();
  });

  const toggleRow = (target) => {
    const checkbox = target.closest(".row-check");
    if (!checkbox) return;
    const key = String(checkbox.dataset.key || "");
    if (checkbox.checked) state.selected.add(key);
    else state.selected.delete(key);
  };

  $("rows").addEventListener("change", (e) => toggleRow(e.target));
  $("mobileCards").addEventListener("change", (e) => toggleRow(e.target));

  const handleRowAction = async (target) => {
    const btn = target.closest("button");
    if (!btn) return;

    if (btn.classList.contains("js-copy-trace")) {
      const trace = String(btn.dataset.trace || "");
      if (!trace) return;
      const ok = await adminUi.copyToClipboard(trace);
      showBanner(ok ? "ok" : "error", ok ? "Trace ID copied to clipboard." : "Could not copy Trace ID.");
      return;
    }

    const key = String(btn.dataset.key || "");
    const job = getJobByKey(key);
    if (!job) return;

    if (btn.classList.contains("js-details")) {
      openDetails(job);
      return;
    }
    if (btn.classList.contains("js-retry")) {
      btn.disabled = true;
      try {
        await runActionOnJob("retry", job);
        showBanner("ok", "Retry queued successfully.");
      } catch (e) {
        showBanner("error", `Retry failed: ${adminApi.normalizeError(e)}`);
      }
      await refresh();
      return;
    }

    if (btn.classList.contains("js-resolve")) {
      btn.disabled = true;
      try {
        await runActionOnJob("resolve", job);
        showBanner("ok", "Job marked resolved.");
      } catch (e) {
        showBanner("error", `Resolve failed: ${adminApi.normalizeError(e)}`);
      }
      await refresh();
    }
  };

  $("rows").addEventListener("click", (e) => handleRowAction(e.target));
  $("mobileCards").addEventListener("click", (e) => handleRowAction(e.target));

  $("retrySelectedBtn").addEventListener("click", async () => {
    const jobs = state.filtered.filter((j) => state.selected.has(`${j.source}:${j.id}`));
    await runBulk("retry", jobs);
  });

  $("retryVisibleBtn").addEventListener("click", async () => {
    await runBulk("retry", [...state.filtered]);
  });

  $("resolveSelectedBtn").addEventListener("click", async () => {
    const jobs = state.filtered.filter((j) => state.selected.has(`${j.source}:${j.id}`));
    await runBulk("resolve", jobs);
  });

  $("copyErrorBtn").addEventListener("click", async () => {
    const ok = await adminUi.copyText($("detailError").textContent || "");
    showBanner(ok ? "ok" : "error", ok ? "Error copied to clipboard." : "Could not copy error.");
  });

  $("copyRawBtn").addEventListener("click", async () => {
    const ok = await adminUi.copyText($("detailBody").textContent || "");
    showBanner(ok ? "ok" : "error", ok ? "Raw details copied to clipboard." : "Could not copy details.");
  });

  $("detailCloseBtn").addEventListener("click", () => $("detailOverlay").classList.remove("open"));
  $("detailOverlay").addEventListener("click", (e) => {
    if (e.target === $("detailOverlay")) $("detailOverlay").classList.remove("open");
  });
}

async function ensureAccess() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = "login.html";
    return false;
  }

  const profile = await getCurrentProfile();
  if (!profile || !isAdmin(profile.role)) {
    showBanner("error", "Access denied for this account.");
    return false;
  }

  state.profile = profile;
  window.FSAdminShell?.mount({
    active: "health",
    title: "Foundation School Admin",
    profileName: profile.full_name || profile.email || "Admin",
    role: profile.role,
    breadcrumbs: [{ label: "Admin", href: "admin-dashboard.html" }, "Retry Center"]
  });

  return true;
}

async function init() {
  if (!adminApi || !adminUi) {
    showBanner("error", "Shared admin modules failed to load.");
    return;
  }

  const ok = await ensureAccess();
  if (!ok) return;
  wireEvents();
  await refresh();
}

init();



