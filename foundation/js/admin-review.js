import { supabase, requireSession, getCurrentProfile, requireRole } from "../auth/auth-client.js";

const STATUS_ORDER = [
  "PENDING",
  "REVIEW",
  "DUPLICATE",
  "WAITLISTED",
  "ASSIGNED",
  "MOODLE_PENDING",
  "MOODLE_SYNCED",
  "MOODLE_FAILED",
];

const state = {
  applicants: [],
  classOptions: [],
  batches: [],
  audits: [],
  moodleSync: [],
  selectedApplicantId: null,
  profile: null,
  loading: false,
  assigning: false,
};

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[m]));

function showFlash(message, type = "") {
  const area = $("flashArea");
  area.innerHTML = message ? `<div class="msg ${type}">${esc(message)}</div>` : "";
}

function toast(message, type = "info") {
  if (window.FSToast?.show) window.FSToast.show(message, type);
}

function normalizedRegistrationStatus(app) {
  const base = String(app.registration_status || "").toUpperCase();
  const sync = state.moodleSync.find((r) => String(r.applicant_id) === String(app.id));
  const syncStatus = String(sync?.sync_status || "").toUpperCase();
  if (base === "ASSIGNED") {
    if (["PENDING", "PROCESSING", "RETRYING"].includes(syncStatus)) return "MOODLE_PENDING";
    if (syncStatus === "SYNCED") return "MOODLE_SYNCED";
    if (syncStatus === "FAILED") return "MOODLE_FAILED";
  }
  return STATUS_ORDER.includes(base) ? base : "PENDING";
}

function statusClass(status) {
  const key = String(status || "").toLowerCase().replace(/_/g, "-");
  return `status-chip status-${key}`;
}

function preferredTime(app) {
  return app.preferred_class_time || app.class_time || app.availability || app.availability_status || "-";
}

function applicantName(app) {
  return app.full_name || [app.first_name, app.last_name].filter(Boolean).join(" ") || "Unnamed Applicant";
}

function displayGroupValue(app) {
  const isRegional = String(app?.fellowship_code || "").toUpperCase() === "REGIONAL";
  if (isRegional && !app?.group_id) return "Regional";
  return app?.group_id || "-";
}

function displaySubgroupValue(app) {
  const isRegional = String(app?.fellowship_code || "").toUpperCase() === "REGIONAL";
  if (isRegional && !app?.subgroup_id) return "Regional";
  return app?.subgroup_id || "-";
}

function activeBatches() {
  return state.batches.filter((b) => b.active === true || String(b.status || "").toUpperCase() === "ACTIVE");
}

function activeClassOptions() {
  return state.classOptions.filter((c) => c.active !== false && c.deleted_at == null);
}

function firstDefined(...vals) {
  return vals.find((v) => v !== undefined && v !== null && String(v).trim() !== "");
}

function computeCapacity(classOptionId) {
  const cls = state.classOptions.find((c) => String(c.class_option_id) === String(classOptionId));
  const max = Number(firstDefined(cls?.max_capacity, cls?.capacity, cls?.max_slots, 0)) || 0;
  const current = state.applicants.filter((a) => {
    if (String(a.class_option_id || "") !== String(classOptionId || "")) return false;
    const st = normalizedRegistrationStatus(a);
    return ["ASSIGNED", "MOODLE_PENDING", "MOODLE_SYNCED", "MOODLE_FAILED"].includes(st);
  }).length;
  return { max, current, full: max > 0 && current >= max };
}

function filteredApplicants() {
  const q = String($("searchInput")?.value || "").toLowerCase().trim();
  const status = String($("statusFilter")?.value || "");
  const fellowship = String($("fellowshipFilter")?.value || "");
  const subgroup = String($("subgroupFilter")?.value || "");

  return state.applicants.filter((app) => {
    const st = normalizedRegistrationStatus(app);
    if (status && st !== status) return false;
    const fellowshipVal = String(app.fellowship_code || app.fellowship_name || "");
    if (fellowship && fellowshipVal !== fellowship) return false;
    if (subgroup && String(app.subgroup_id || "") !== subgroup) return false;
    if (!q) return true;
    const hay = [applicantName(app), app.email, app.phone, app.fellowship_code, app.group_id, app.subgroup_id].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderSummary(rows) {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  rows.forEach((r) => {
    const s = normalizedRegistrationStatus(r);
    counts[s] = (counts[s] || 0) + 1;
  });
  const cards = [
    { label: "Total", value: rows.length },
    { label: "Pending/Review", value: (counts.PENDING || 0) + (counts.REVIEW || 0) },
    { label: "Waitlisted", value: counts.WAITLISTED || 0 },
    { label: "Assigned", value: (counts.ASSIGNED || 0) + (counts.MOODLE_PENDING || 0) + (counts.MOODLE_SYNCED || 0) + (counts.MOODLE_FAILED || 0) },
  ];
  $("summaryGrid").innerHTML = cards.map((c) => `
    <article class="summary-card">
      <div class="summary-label">${esc(c.label)}</div>
      <div class="summary-value">${esc(c.value)}</div>
    </article>
  `).join("");
}

function renderFilters() {
  const statusFilter = $("statusFilter");
  statusFilter.innerHTML = `<option value="">All statuses</option>${STATUS_ORDER.map((s) => `<option value="${s}">${s}</option>`).join("")}`;

  const fellowships = [...new Set(state.applicants.map((a) => a.fellowship_code || a.fellowship_name).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  $("fellowshipFilter").innerHTML = `<option value="">All fellowships</option>${fellowships.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("")}`;

  const subgroups = [...new Set(state.applicants.map((a) => a.subgroup_id).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  $("subgroupFilter").innerHTML = `<option value="">All subgroups</option>${subgroups.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}`;
}

function renderTable(rows) {
  const tbody = $("applicantTableBody");
  const cards = $("mobileCards");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="msg">No applicants found for the selected filters.</div></td></tr>`;
    cards.innerHTML = `<div class="msg">No applicants found for the selected filters.</div>`;
    return;
  }

  tbody.innerHTML = rows.map((app) => {
    const status = normalizedRegistrationStatus(app);
    const classLabel = app.class_option_id || "Unassigned";
    const duplicateWarning = Number(app.duplicate_count || 0) > 1 ? `<div style="font-size:11px;color:#991b1b">Duplicate (${esc(app.duplicate_count)})</div>` : "";
    return `
      <tr>
        <td><strong>${esc(applicantName(app))}</strong>${duplicateWarning}</td>
        <td>${esc(app.email || "-")}<br><span style="color:var(--muted)">${esc(app.phone || "-")}</span></td>
        <td>${esc(app.fellowship_code || app.fellowship_name || "-")}<br><span style="color:var(--muted)">${esc(displayGroupValue(app))} / ${esc(displaySubgroupValue(app))}</span></td>
        <td>${esc(preferredTime(app))}</td>
        <td><span class="${statusClass(status)}">${esc(status)}</span></td>
        <td>${esc(classLabel)}</td>
        <td><button class="btn" data-open="${esc(app.id)}">Open</button> <button class="btn" data-profile="${esc(app.id)}">Profile</button></td>
      </tr>
    `;
  }).join("");

  cards.innerHTML = rows.map((app) => {
    const status = normalizedRegistrationStatus(app);
    return `
      <article class="mobile-card">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <strong>${esc(applicantName(app))}</strong>
          <span class="${statusClass(status)}">${esc(status)}</span>
        </div>
        <div style="margin-top:6px;font-size:12px;color:var(--muted)">${esc(app.email || "-")} &middot; ${esc(app.phone || "-")}</div>
        <div style="margin-top:6px;font-size:12px">${esc(app.fellowship_code || "-")} &middot; ${esc(preferredTime(app))}</div>
        <div class="actions" style="margin-top:8px"><button class="btn" data-open="${esc(app.id)}">Open</button><button class="btn" data-profile="${esc(app.id)}">Profile</button></div>
      </article>
    `;
  }).join("");
}

function groupDuplicates() {
  const byEmail = new Map();
  for (const app of state.applicants) {
    const email = String(app.email || "").toLowerCase().trim();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(app);
  }
  // Only show unresolved duplicate groups:
  // once a group has a single kept record and the rest marked DUPLICATE,
  // hide it from the duplicate resolution panel.
  return [...byEmail.values()].filter((g) => {
    if (g.length <= 1) return false;
    const nonDuplicate = g.filter((app) => normalizedRegistrationStatus(app) !== "DUPLICATE");
    return nonDuplicate.length > 1;
  });
}

async function resolveDuplicateGroup(email, keepId) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const group = state.applicants.filter((a) => String(a.email || "").toLowerCase().trim() === normalizedEmail);
  if (group.length < 2) return;
  const keep = group.find((a) => String(a.id) === String(keepId));
  if (!keep) return;

  const now = new Date().toISOString();
  const others = group.filter((a) => String(a.id) !== String(keepId));

  try {
    const { error: keepErr } = await supabase
      .from("applicants")
      .update({
        registration_status: "PENDING",
        needs_admin_review: false,
        reviewed_at: now,
        updated_at: now,
        updated_by: state.profile?.email || null,
      })
      .eq("id", keep.id);
    if (keepErr) throw keepErr;

    for (const rec of others) {
      const { error: dupErr } = await supabase
        .from("applicants")
        .update({
          registration_status: "DUPLICATE",
          needs_admin_review: true,
          reviewed_at: now,
          updated_at: now,
          updated_by: state.profile?.email || null,
        })
        .eq("id", rec.id);
      if (dupErr) throw dupErr;
    }

    await logAudit("DUPLICATE_GROUP_RESOLVED", {
      entity_id: String(keep.id),
      details: {
        email: normalizedEmail,
        kept_applicant_id: keep.id,
        duplicate_applicant_ids: others.map((r) => r.id),
      },
    });

    showFlash("Duplicate group resolved.", "success");
    toast("Duplicate resolved", "success");
    await loadData();
    openDetail(keep.id);
  } catch (err) {
    console.error("DUPLICATE_GROUP_RESOLVE_FAILED", { email: normalizedEmail, keepId, error: err?.message || err });
    showFlash(`Duplicate resolution failed: ${err?.message || err}`, "error");
    toast("Duplicate resolution failed", "error");
  }
}
function renderDuplicates() {
  const groups = groupDuplicates();
  const section = document.getElementById("dupSection");
  const badge = document.getElementById("dupBadge");
  const body = document.getElementById("dupBody");
  if (!section || !badge || !body) return;
  if (!groups.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";
  badge.textContent = `${groups.length} group${groups.length === 1 ? "" : "s"}`;

  body.innerHTML = groups.map((group) => {
    const sorted = [...group].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    const cards = sorted.map((app) => {
      const st = normalizedRegistrationStatus(app);
      const created = app.created_at ? new Date(app.created_at).toLocaleString() : "-";
      return `<article style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-3);background:var(--color-surface)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
          <strong>${esc(applicantName(app))}</strong>
          <span class="${statusClass(st)}">${esc(st)}</span>
        </div>
        <div style="font-size:12px;color:var(--color-text-muted);display:grid;gap:2px">
          <div><strong>Email:</strong> ${esc(app.email || "-")}</div>
          <div><strong>Phone:</strong> ${esc(app.phone || "-")}</div>
          <div><strong>Fellowship:</strong> ${esc(app.fellowship_code || "-")}</div>
          <div><strong>Preferred:</strong> ${esc(preferredTime(app))}</div>
          <div><strong>Created:</strong> ${esc(created)}</div>
          <div><strong>Class:</strong> ${esc(app.class_option_id || "Unassigned")}</div>
        </div>
        <div class="actions" style="margin-top:8px">
          <button class="btn" data-dup-keep="${esc(app.id)}" data-dup-email="${esc(app.email || "")}">Keep This Record</button>
          <button class="btn" data-open="${esc(app.id)}">Open</button>
          <button class="btn" data-dup-flag="${esc(app.id)}">Flag Review</button>
        </div>
      </article>`;
    }).join("");
    return `<div style="margin-bottom:var(--space-3);padding:var(--space-3);border:1px solid color-mix(in srgb,var(--color-danger-fg) 20%,transparent);border-radius:var(--radius-md);background:var(--color-danger-bg)">
      <div style="font-size:12px;font-weight:700;color:var(--color-danger-fg);margin-bottom:8px">${esc(sorted[0].email || "")} — ${sorted.length} registrations</div>
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${cards}</div>
    </div>`;
  }).join("");

  body.querySelectorAll("[data-dup-keep]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-dup-keep");
      const email = btn.getAttribute("data-dup-email");
      if (!id || !email) return;
      if (!confirm("Keep this record and mark the other duplicates as DUPLICATE?")) return;
      await resolveDuplicateGroup(email, id);
    });
  });

  body.querySelectorAll("[data-dup-flag]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.selectedApplicantId = btn.getAttribute("data-dup-flag");
      await markStatus("REVIEW");
    });
  });
}
function renderAll() {
  const rows = filteredApplicants();
  renderSummary(rows);
  renderTable(rows);
  renderDuplicates();
}

function byId(arr, id, key = "id") {
  return arr.find((x) => String(x?.[key]) === String(id));
}

function renderDetail(app) {
  const status = normalizedRegistrationStatus(app);
  $("detailTitle").textContent = applicantName(app);
  $("detailKv").innerHTML = [
    ["Email", app.email || "-"],
    ["Phone", app.phone || "-"],
    ["Fellowship", app.fellowship_code || app.fellowship_name || "-"],
    ["Group/Subgroup", `${displayGroupValue(app)} / ${displaySubgroupValue(app)}`],
    ["Preferred Time", preferredTime(app)],
    ["Class Option", app.class_option_id || "Unassigned"],
    ["Batch", app.batch_id || "-"],
    ["Status", status],
  ].map(([k, v]) => `<div class="kv-item"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("");

  const history = state.audits
    .filter((a) => String(a.entity_id || "") === String(app.id) || String(a.applicant_id || "") === String(app.id))
    .slice(0, 20);
  $("auditHistory").innerHTML = history.length
    ? history.map((h) => `<div class="history-row"><strong>${esc(h.action || h.event_type || "EVENT")}</strong><div style="color:var(--muted)">${esc(h.created_at || h.logged_at || "")}</div><div>${esc((h.details && JSON.stringify(h.details)) || h.notes || "")}</div></div>`).join("")
    : `<div class="msg">No audit entries found.</div>`;

  populateAssignmentOptions(app);
}

function openDetail(applicantId) {
  state.selectedApplicantId = applicantId;
  const app = byId(state.applicants, applicantId);
  if (!app) return;
  renderDetail(app);
  $("detailModal").classList.add("open");
  $("detailModal").setAttribute("aria-hidden", "false");
}

function closeDetail() {
  $("detailModal").classList.remove("open");
  $("detailModal").setAttribute("aria-hidden", "true");
}

function populateAssignmentOptions(app) {
  const batches = activeBatches();
  $("assignBatch").innerHTML = batches.length
    ? batches.map((b) => `<option value="${esc(b.batch_id)}">${esc(b.batch_name || b.batch_id)}</option>`).join("")
    : `<option value="">No active batch</option>`;

  if (app?.batch_id && batches.some((b) => String(b.batch_id) === String(app.batch_id))) {
    $("assignBatch").value = app.batch_id;
  }
  repopulateClassOptions();
}

function repopulateClassOptions() {
  const batchId = $("assignBatch").value;
  const list = activeClassOptions().filter((c) => !batchId || String(c.batch_id || "") === String(batchId));
  $("assignClass").innerHTML = list.length
    ? list.map((c) => `<option value="${esc(c.class_option_id)}">${esc(c.class_option_id)} &mdash; ${esc(c.day || "")} ${esc(c.class_time || "")}</option>`).join("")
    : `<option value="">No active class options for selected batch</option>`;
  updateAssignInfo();
}

function updateAssignInfo() {
  const classId = $("assignClass").value;
  if (!classId) {
    $("assignInfo").textContent = "Select batch and class option.";
    return;
  }
  const cap = computeCapacity(classId);
  const cls = byId(state.classOptions, classId, "class_option_id");
  const capText = cap.max > 0 ? `${cap.current}/${cap.max}` : `${cap.current}/unlimited`;
  $("assignInfo").textContent = `${cls?.day || ""} ${cls?.class_time || ""} — Capacity ${capText}${cap.full ? " (FULL)" : ""}`;
}

async function logAudit(action, payload = {}) {
  const row = {
    action,
    event_type: action,
    entity_type: payload.entity_type || "applicant",
    entity_id: payload.entity_id || state.selectedApplicantId || null,
    actor_email: state.profile?.email || null,
    status: "SUCCESS",
    details: payload.details || {},
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("audit_logs").insert(row);
  if (error) console.warn("AUDIT_LOG_WRITE_FAILED", error.message);
}

function buildStudentId(app) {
  const base = (app.email || app.id || "student").toString().replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toUpperCase();
  return `STU-${base}-${Date.now().toString().slice(-6)}`;
}

async function assignApplicant() {
  if (state.assigning) return;
  const app = byId(state.applicants, state.selectedApplicantId);
  if (!app) return;

  const batchId = String($("assignBatch").value || "").trim();
  const classOptionId = String($("assignClass").value || "").trim();
  if (!batchId || !classOptionId) {
    showFlash("Select active batch and class option before assigning.", "error");
    return;
  }

  const cap = computeCapacity(classOptionId);
  if (cap.full && String(app.class_option_id || "") !== String(classOptionId)) {
    showFlash(`Class is at capacity (${cap.current}/${cap.max}). Choose another class.`, "error");
    return;
  }

  const cls = byId(state.classOptions, classOptionId, "class_option_id");
  const duplicateAttempt = String(app.class_option_id || "") === classOptionId && String(app.batch_id || "") === batchId;

  state.assigning = true;
  $("assignBtn").disabled = true;

  try {
    const { data, error } = await supabase.functions.invoke("admin-api", {
      body: {
        action: "assign-applicant-admin",
        applicant_id: app.id,
        class_option_id: classOptionId,
        batch_id: batchId,
        actor_email: state.profile?.email || null,
        duplicate_attempt: duplicateAttempt,
      },
    });
    if (error || !data?.ok) {
      throw new Error(String(data?.error || error?.message || "Assignment failed"));
    }

    showFlash("Applicant assigned successfully.", "success");
    toast("Applicant assigned", "success");
    await loadData();
    openDetail(app.id);
  } catch (err) {
    console.error("ADMIN_ASSIGNMENT_FAILED", {
      applicant_id: app.id,
      class_option_id: classOptionId,
      batch_id: batchId,
      error: err?.message || err,
    });
    showFlash(`Assignment failed: ${err?.message || err}`, "error");
    toast("Assignment failed", "error");
  } finally {
    state.assigning = false;
    $("assignBtn").disabled = false;
  }
}

async function markStatus(nextStatus) {
  const app = byId(state.applicants, state.selectedApplicantId);
  if (!app) return;
  const now = new Date().toISOString();
  const status = String(nextStatus || "").toUpperCase();
  if (!["WAITLISTED", "DUPLICATE", "REVIEW"].includes(status)) return;

  const patch = {
    registration_status: status,
    reviewed_at: now,
    updated_at: now,
    updated_by: state.profile?.email || null,
  };
  if (status === "WAITLISTED") {
    patch.waitlisted_at = now;
    patch.retry_assignment = true;
    patch.availability_status = patch.availability_status || "NO_CLASS_AVAILABLE";
    patch.status = "Pending";
  }
  if (status === "DUPLICATE") {
    patch.needs_admin_review = true;
    patch.status = "Pending";
  }
  if (status === "REVIEW") {
    patch.needs_admin_review = true;
    patch.status = "Pending";
    patch.availability_status = "MANUAL_REVIEW_REQUIRED";
  }

  try {
    const { error } = await supabase.from("applicants").update(patch).eq("id", app.id);
    if (error) throw error;

    await logAudit(`APPLICANT_MARKED_${status}`, {
      entity_id: String(app.id),
      details: { applicant_id: app.id, status },
    });

    supabase.from("in_app_notifications").insert({
      recipient_role: "admin",
      title: "Registration updated",
      body: `${applicantName(app)} moved to ${status}`,
      type: "info",
      created_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});

    showFlash(`Applicant marked ${status}.`, "success");
    await loadData();
    openDetail(app.id);
  } catch (err) {
    console.error("APPLICANT_MARK_STATUS_FAILED", { applicant_id: app.id, status, error: err?.message || err });
    showFlash(`Failed to mark ${status}: ${err?.message || err}`, "error");
  }
}

async function safeLoadTable(fn, fallback = []) {
  try {
    return await fn();
  } catch (err) {
    console.warn("ADMIN_REVIEW_LOAD_WARNING", err?.message || err);
    return fallback;
  }
}


async function resolveApplicant(applicantId) {
  const app = byId(state.applicants, applicantId);
  if (!app) return;

  const current = normalizedRegistrationStatus(app);
  const now = new Date().toISOString();
  const basePatch = {
    reviewed_at: now,
    updated_at: now,
    updated_by: state.profile?.email || null,
  };

  let patch = { ...basePatch };
  let transition = "NO_CHANGE";

  if (current === "REVIEW" || current === "DUPLICATE") {
    patch.registration_status = "PENDING";
    patch.needs_admin_review = false;
    transition = `${current}->PENDING`;
  } else if (current === "WAITLISTED") {
    patch = { ...basePatch, needs_attention: false };
    transition = "WAITLISTED->WAITLISTED";
  } else if (["ASSIGNED", "MOODLE_PENDING", "MOODLE_SYNCED", "MOODLE_FAILED"].includes(current)) {
    patch = { ...basePatch };
    transition = `${current}->${current}`;
  } else {
    transition = `${current}->${current}`;
  }

  try {
    let update = await supabase.from("applicants").update(patch).eq("id", app.id);
    if (update.error && /needs_attention|column .* does not exist|42703/i.test(String(update.error.message || ""))) {
      const fallbackPatch = { ...basePatch };
      if (current === "REVIEW" || current === "DUPLICATE") {
        fallbackPatch.registration_status = "PENDING";
        fallbackPatch.needs_admin_review = false;
      }
      update = await supabase.from("applicants").update(fallbackPatch).eq("id", app.id);
    }
    if (update.error) throw update.error;

    await logAudit("APPLICANT_RESOLVED", {
      entity_id: String(app.id),
      details: {
        applicant_id: app.id,
        from_status: current,
        transition,
      },
    });

    toast("Applicant resolved", "success");
    showFlash("Applicant resolved successfully.", "success");
    await loadData();
    openDetail(app.id);
  } catch (err) {
    console.error("APPLICANT_RESOLVE_FAILED", { applicant_id: app.id, error: err?.message || err });
    toast("Resolve failed", "error");
    showFlash(`Resolve failed: ${err?.message || err}`, "error");
  }
}
async function loadData() {
  if (state.loading) return;
  state.loading = true;
  showFlash("Loading applicants...");
  try {
    const [applicants, classOptions, batches, audits, moodleSync] = await Promise.all([
      safeLoadTable(async () => {
        const { data, error } = await supabase.from("applicants").select("*").order("created_at", { ascending: false }).limit(3000);
        if (error) throw error;
        return data || [];
      }),
      safeLoadTable(async () => {
        const { data, error } = await supabase.from("class_options").select("*").order("created_at", { ascending: false }).limit(2000);
        if (error) throw error;
        return data || [];
      }),
      safeLoadTable(async () => {
        const { data, error } = await supabase.from("batches").select("batch_id,batch_name,status,active,start_date,start_sunday").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return data || [];
      }),
      safeLoadTable(async () => {
        const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(3000);
        if (error) throw error;
        return data || [];
      }),
      safeLoadTable(async () => {
        const primary = await supabase.from("moodle_enrollment_sync").select("*").order("created_at", { ascending: false }).limit(2000);
        if (!primary.error) return primary.data || [];
        return [];
      }),
    ]);

    state.applicants = applicants;
    state.classOptions = classOptions;
    state.batches = batches;
    state.audits = audits;
    state.moodleSync = moodleSync;

    renderFilters();
    renderAll();
    showFlash("");
  } catch (err) {
    console.error("ADMIN_REVIEW_LOAD_FAILED", err);
    showFlash(`Failed to load admin review data: ${err?.message || err}`, "error");
  } finally {
    state.loading = false;
  }
}

function wireEvents() {
  $("searchInput").addEventListener("input", renderAll);
  $("statusFilter").addEventListener("change", renderAll);
  $("fellowshipFilter").addEventListener("change", renderAll);
  $("subgroupFilter").addEventListener("change", renderAll);
  $("refreshBtn").addEventListener("click", loadData);

  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) {
      openDetail(openBtn.getAttribute("data-open"));
    }

    const profileBtn = e.target.closest("[data-profile]");
    if (profileBtn) {
      window.FSStudentProfile?.open(profileBtn.getAttribute("data-profile"));
    }

    const markBtn = e.target.closest("[data-mark]");
    if (markBtn) {
      markStatus(markBtn.getAttribute("data-mark"));
    }
  });

  $("closeDetailBtn").addEventListener("click", closeDetail);
  $("detailModal").addEventListener("click", (e) => {
    if (e.target.id === "detailModal") closeDetail();
  });
  $("assignBatch").addEventListener("change", repopulateClassOptions);
  $("assignClass").addEventListener("change", updateAssignInfo);
  $("assignBtn").addEventListener("click", assignApplicant);
  $("resolveBtn").addEventListener("click", async () => {
    if (!state.selectedApplicantId) return;
    await resolveApplicant(state.selectedApplicantId);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
}

async function boot() {
  if (!window.FS_CONFIG || !window.FS_CONFIG.SUPABASE_URL) {
    window.FSAdminShell && window.FSAdminShell.mount({ active: "registrations", pageTitle: "Admin Review", profileName: "Not connected" });
    showFlash("Not connected — open this page through a live server with config.js in place to load data", "error");
    return;
  }
  const session = await requireSession();
  if (!session) return;

  const profile = await getCurrentProfile();
  const mainEl = document.querySelector("main");
  const allowed = new Set(["admin", "superadmin", "principal", "regional_secretary"]);
  if (!requireRole(profile, allowed, { containerEl: mainEl })) return;
  state.profile = profile;

  window.FSAdminShell && window.FSAdminShell.mount({
    active: "registrations",
    pageTitle: "Admin Review",
  });
  window.FSAdminShell && window.FSAdminShell.setProfile(profile.full_name || profile.email || "Admin");
  window.FSStudentProfile?.init({ supabase, userRole: state.profile?.role || "admin" });

  wireEvents();
  await loadData();
}

boot().catch((err) => {
  console.error("ADMIN_REVIEW_BOOT_FAILED", err);
  showFlash(`Unable to initialize admin review: ${err?.message || err}`, "error");
});


