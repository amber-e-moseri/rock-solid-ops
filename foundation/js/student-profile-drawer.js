/* Universal Student Profile Drawer — window.FSStudentProfile = { init, open, close } */
(function () {
  "use strict";

  const DRAWER_ID  = "fspd-drawer";
  const OVERLAY_ID = "fspd-overlay";

  let _sb       = null;
  let _role     = "";
  let _sid      = null;
  let _idType   = "applicant";
  let _activeTab = "overview";

  const esc = (v) =>
    String(v ?? "").replace(/[&<>'"]/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" }[m]));

  const fmt = (v) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
  };

  const isAdminLike = (r) => ["admin", "superadmin", "principal", "regional_secretary"].includes(String(r || "").toLowerCase());
  const isTeacher   = (r) => String(r || "").toLowerCase() === "teacher";

  /* ------------------------------------------------------------------
     HTML shell — injected once into document.body
  ------------------------------------------------------------------ */
  function buildShell() {
    const el = document.createElement("div");
    el.innerHTML = `
<div id="${OVERLAY_ID}" style="
  position:fixed;inset:0;background:rgba(11,8,19,.42);backdrop-filter:blur(3px);
  z-index:600;opacity:0;pointer-events:none;transition:opacity .2s
"></div>
<aside id="${DRAWER_ID}" aria-hidden="true" style="
  position:fixed;top:0;right:0;bottom:0;width:min(480px,100vw);
  background:var(--color-surface,#fff);
  border-left:1px solid var(--color-border,#e5e7eb);
  box-shadow:-4px 0 24px rgba(0,0,0,.12);
  z-index:601;transform:translateX(100%);
  transition:transform .25s cubic-bezier(.4,0,.2,1);
  display:flex;flex-direction:column;overflow:hidden;
">
  <!-- Header -->
  <div style="
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:16px 20px;border-bottom:1px solid var(--color-border,#e5e7eb);flex-shrink:0
  ">
    <div style="min-width:0">
      <div id="fspd-name" style="font-size:18px;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      <div id="fspd-sub"  style="font-size:12px;color:var(--color-text-muted,#6b7280);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
    </div>
    <button id="fspd-close" style="
      flex-shrink:0;padding:6px 14px;border-radius:8px;border:1px solid var(--color-border,#e5e7eb);
      background:var(--color-surface,#fff);color:var(--color-text-primary,#111);
      font:600 13px/1.4 inherit;cursor:pointer
    " aria-label="Close">Close</button>
  </div>

  <!-- Tabs -->
  <div id="fspd-tabs" style="
    display:flex;border-bottom:1px solid var(--color-border,#e5e7eb);flex-shrink:0;overflow-x:auto;
    scrollbar-width:none
  ">
    <button class="fspd-tab" data-tab="overview"    style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Overview</button>
    <button class="fspd-tab" data-tab="attendance"  style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Attendance</button>
    <button class="fspd-tab" data-tab="milestones"  style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Milestones</button>
    <button id="fspd-tab-moodle" class="fspd-tab" data-tab="moodle" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Moodle</button>
  </div>

  <!-- Body -->
  <div id="fspd-body" style="flex:1;overflow-y:auto;padding:16px 20px"></div>
</aside>
<style>
  @keyframes fspd-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
  .fspd-kv { display:grid;grid-template-columns:1fr 1fr;gap:10px }
  .fspd-kv-item { background:var(--color-surface-raised,#f9fafb);border:1px solid var(--color-border,#e5e7eb);border-radius:10px;padding:12px }
  .fspd-kv-item .k { font-size:11px;color:var(--color-text-muted,#6b7280);text-transform:uppercase;letter-spacing:.04em;font-weight:600 }
  .fspd-kv-item .v { font-size:14px;font-weight:600;margin-top:4px;word-break:break-word }
  .fspd-row { display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--color-border,#e5e7eb);font-size:13px }
  .fspd-row:last-child { border-bottom:none }
  .fspd-badge { display:inline-flex;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700 }
  .fspd-badge.ok   { background:#dcfce7;color:#166534 }
  .fspd-badge.bad  { background:#fee2e2;color:#991b1b }
  .fspd-badge.warn { background:#fef9c3;color:#854d0e }
  .fspd-badge.mute { background:#f3f4f6;color:#6b7280 }
  .fspd-skel { height:56px;border-radius:10px;background:var(--color-surface-raised,#f3f4f6);animation:fspd-pulse 1.2s ease infinite }
  .fspd-empty { color:var(--color-text-muted,#6b7280);padding:32px 0;text-align:center;font-size:13px }
  .fspd-stat-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px }
  .fspd-stat { background:var(--color-surface-raised,#f9fafb);border:1px solid var(--color-border,#e5e7eb);border-radius:10px;padding:12px;text-align:center }
  .fspd-stat .lbl { font-size:11px;color:var(--color-text-muted,#6b7280);text-transform:uppercase;letter-spacing:.04em;font-weight:600 }
  .fspd-stat .val { font-size:24px;font-weight:800;margin-top:4px }
  @media (max-width:520px) { .fspd-kv { grid-template-columns:1fr } }
</style>`;
    while (el.firstChild) document.body.appendChild(el.firstChild);
  }

  /* ------------------------------------------------------------------
     Tab switching
  ------------------------------------------------------------------ */
  function activateTab(name) {
    _activeTab = name;
    document.querySelectorAll(".fspd-tab").forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.style.borderBottomColor = on ? "var(--color-primary,#4C2A92)" : "transparent";
      btn.style.color = on ? "var(--color-primary,#4C2A92)" : "var(--color-text-muted,#6b7280)";
    });
    loadTab(name);
  }

  /* ------------------------------------------------------------------
     Helpers
  ------------------------------------------------------------------ */
  function body() { return document.getElementById("fspd-body"); }

  function skeleton() {
    body().innerHTML = `<div style="display:grid;gap:10px">${Array(5)
      .fill('<div class="fspd-skel"></div>').join("")}</div>`;
  }

  function errMsg(msg) {
    body().innerHTML = `<div style="
      color:#b42318;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;font-size:13px
    ">${esc(msg)}</div>`;
  }

  /* ------------------------------------------------------------------
     open / close
  ------------------------------------------------------------------ */
  function open(studentId, options = {}) {
    _sid    = String(studentId);
    _idType = options.idType || "applicant";

    const drawer  = document.getElementById(DRAWER_ID);
    const overlay = document.getElementById(OVERLAY_ID);
    if (!drawer) return;

    drawer.style.transform = "translateX(0)";
    drawer.setAttribute("aria-hidden", "false");
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";

    // Hide Moodle tab for teachers
    const moodleTab = document.getElementById("fspd-tab-moodle");
    if (moodleTab) moodleTab.style.display = isTeacher(_role) ? "none" : "";

    activateTab("overview");
  }

  function close() {
    const drawer  = document.getElementById(DRAWER_ID);
    const overlay = document.getElementById(OVERLAY_ID);
    if (!drawer) return;
    drawer.style.transform = "translateX(100%)";
    drawer.setAttribute("aria-hidden", "true");
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    _sid = null;
  }

  /* ------------------------------------------------------------------
     Tab routing
  ------------------------------------------------------------------ */
  async function loadTab(name) {
    if (!_sid || !_sb) return;
    skeleton();
    try {
      if      (name === "overview")    await tabOverview();
      else if (name === "attendance")  await tabAttendance();
      else if (name === "milestones")  await tabMilestones();
      else if (name === "moodle")      await tabMoodle();
    } catch (err) {
      errMsg(`Failed to load ${name}: ${err?.message || err}`);
    }
  }

  /* ------------------------------------------------------------------
     Fetch helpers
  ------------------------------------------------------------------ */
  async function fetchApplicant() {
    const { data, error } = await _sb.from("applicants").select("*").eq("id", _sid).single();
    if (error) throw error;
    return data;
  }

  /* ------------------------------------------------------------------
     Tab: Overview
  ------------------------------------------------------------------ */
  async function tabOverview() {
    const app = await fetchApplicant();

    document.getElementById("fspd-name").textContent = app.full_name || "Student";
    document.getElementById("fspd-sub").textContent =
      `${app.email || "-"} · ${app.phone || app.phone_number || "-"}`;

    const fields = [
      ["Fellowship",       app.fellowship_code || app.fellowship_name || "-"],
      ["Group / Subgroup", `${app.group_id || "-"} / ${app.subgroup_id || "-"}`],
      ["Assigned Class",   app.class_option_id || "Not assigned"],
      ["Batch",            app.batch_id || "-"],
      ["Status",           app.registration_status || app.status || "-"],
      ["Preferred Time",   app.preferred_class_time || app.class_time || app.availability || "-"],
      ["Registered",       fmt(app.created_at)],
      ["Last Updated",     fmt(app.updated_at)],
    ];

    if (isAdminLike(_role)) {
      fields.push(
        ["Needs Admin Review", app.needs_admin_review ? "Yes" : "No"],
        ["Reviewed At",        fmt(app.reviewed_at)],
        ["Reviewed By",        app.updated_by || "-"],
        ["Admin Notes",        app.admin_notes || app.notes || "-"],
      );
    }

    body().innerHTML = `<div class="fspd-kv">${
      fields.map(([k, v]) => `
        <div class="fspd-kv-item">
          <div class="k">${esc(k)}</div>
          <div class="v">${esc(v)}</div>
        </div>`).join("")
    }</div>`;
  }

  /* ------------------------------------------------------------------
     Tab: Attendance
  ------------------------------------------------------------------ */
  async function tabAttendance() {
    // Try attendance_records first, then attendance_log
    let rows = [];
    const col = "applicant_id";

    const { data: rec } = await _sb
      .from("attendance_records")
      .select("*")
      .eq(col, _sid)
      .order("class_date", { ascending: false })
      .limit(200);

    if (rec?.length) {
      rows = rec;
    } else {
      const { data: log } = await _sb
        .from("attendance_log")
        .select("*")
        .eq("student_id", _sid)
        .order("class_date", { ascending: false })
        .limit(200);
      rows = log || [];
    }

    if (!rows.length) {
      body().innerHTML = `<div class="fspd-empty">No attendance records found.</div>`;
      return;
    }

    const total    = rows.length;
    const attended = rows.filter((r) => r.present === true || r.present === 1).length;
    const pct      = total > 0 ? Math.round((attended / total) * 100) : 0;

    body().innerHTML = `
      <div class="fspd-stat-grid">
        <div class="fspd-stat"><div class="lbl">Attendance</div><div class="val">${pct}%</div></div>
        <div class="fspd-stat"><div class="lbl">Present</div><div class="val">${attended}/${total}</div></div>
        <div class="fspd-stat"><div class="lbl">Absent</div><div class="val">${total - attended}</div></div>
      </div>
      <div style="border:1px solid var(--color-border,#e5e7eb);border-radius:10px;overflow:hidden">
        ${rows.map((r) => {
          const present = r.present === true || r.present === 1;
          return `<div class="fspd-row">
            <div>
              <strong>${esc(r.class_date || r.date || "-")}</strong>
              <span style="color:var(--color-text-muted,#6b7280);margin-left:8px">Class ${esc(String(r.class_number || r.session_key || "-"))}</span>
              ${r.teacher_name || r.teacher_email ? `<span style="color:var(--color-text-muted,#6b7280);margin-left:6px">· ${esc(r.teacher_name || r.teacher_email)}</span>` : ""}
            </div>
            <span class="fspd-badge ${present ? "ok" : "bad"}">${present ? "Present" : "Absent"}</span>
          </div>`;
        }).join("")}
      </div>`;
  }

  /* ------------------------------------------------------------------
     Tab: Milestones
  ------------------------------------------------------------------ */
  async function tabMilestones() {
    const { data } = await _sb
      .from("student_milestone_status")
      .select("*")
      .eq("applicant_id", _sid)
      .order("updated_at", { ascending: false })
      .limit(200);

    const rows = data || [];
    if (!rows.length) {
      body().innerHTML = `<div class="fspd-empty">No milestone data found.</div>`;
      return;
    }

    const completed = rows.filter((m) => m.status === "completed" || m.completed === true).length;

    body().innerHTML = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--color-text-muted,#6b7280)">${completed} of ${rows.length} completed</div>
      <div style="display:grid;gap:8px">
        ${rows.map((m) => {
          const done  = m.status === "completed" || m.completed === true;
          const label = m.milestone_code || m.milestone_name || m.name || m.milestone_id || "-";
          return `<div style="
            display:flex;justify-content:space-between;align-items:center;gap:12px;
            padding:10px 12px;border:1px solid var(--color-border,#e5e7eb);border-radius:10px;
            background:var(--color-surface-raised,#f9fafb)
          ">
            <div>
              <div style="font-weight:600;font-size:13px">${esc(label)}</div>
              ${m.completed_at ? `<div style="font-size:11px;color:var(--color-text-muted,#6b7280);margin-top:2px">${fmt(m.completed_at)}${m.completed_by ? ` · ${esc(m.completed_by)}` : ""}</div>` : ""}
            </div>
            <span class="fspd-badge ${done ? "ok" : "mute"}">${done ? "Completed" : "Pending"}</span>
          </div>`;
        }).join("")}
      </div>`;
  }

  /* ------------------------------------------------------------------
     Tab: Moodle  (admin/superadmin only)
  ------------------------------------------------------------------ */
  async function tabMoodle() {
    if (isTeacher(_role)) {
      body().innerHTML = `<div class="fspd-empty">Moodle data is not available for this role.</div>`;
      return;
    }

    const app = await fetchApplicant();

    const [{ data: syncRows }, { data: gradeRows }] = await Promise.all([
      _sb.from("moodle_enrollment_sync")
        .select("*")
        .or(`applicant_id.eq.${_sid},student_id.eq.${_sid}`)
        .order("created_at", { ascending: false })
        .limit(10),
      _sb.from("student_grades")
        .select("*")
        .or(`applicant_id.eq.${_sid},student_id.eq.${_sid}`)
        .order("synced_at", { ascending: false })
        .limit(20),
    ]);

    const latest = (syncRows || [])[0];
    const grades = gradeRows || [];

    const badgeClass = {
      SYNCED:  "ok",
      PENDING: "warn",
      FAILED:  "bad",
    }[String(latest?.sync_status || "").toUpperCase()] || "mute";

    body().innerHTML = `
      <div style="display:grid;gap:12px">
        <div style="background:var(--color-surface-raised,#f9fafb);border:1px solid var(--color-border,#e5e7eb);border-radius:10px;padding:14px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted,#6b7280);margin-bottom:10px">Sync Status</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
            <div>
              ${latest ? `
                <span class="fspd-badge ${badgeClass}">${esc(latest.sync_status || "-")}</span>
                <div style="font-size:12px;color:var(--color-text-muted,#6b7280);margin-top:6px">Last synced: ${fmt(latest.synced_at || latest.updated_at)}</div>
                ${latest.moodle_user_id ? `<div style="font-size:12px;color:var(--color-text-muted,#6b7280)">Moodle User ID: ${esc(String(latest.moodle_user_id))}</div>` : ""}
                ${latest.last_error ? `<div style="font-size:12px;color:#991b1b;margin-top:4px">Error: ${esc(latest.last_error)}</div>` : ""}
              ` : `<span style="font-size:13px;color:var(--color-text-muted,#6b7280)">No sync records found.</span>`}
            </div>
            <button id="fspd-sync-btn" style="
              padding:7px 14px;border-radius:8px;border:1px solid var(--color-primary,#4C2A92);
              background:var(--color-primary,#4C2A92);color:#fff;font:600 12px/1.4 inherit;cursor:pointer;white-space:nowrap
            ">Sync Now</button>
          </div>
        </div>

        ${grades.length ? `
          <div style="border:1px solid var(--color-border,#e5e7eb);border-radius:10px;overflow:hidden">
            <div style="padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted,#6b7280);border-bottom:1px solid var(--color-border,#e5e7eb);background:var(--color-surface-raised,#f9fafb)">Grade History</div>
            ${grades.map((g) => `
              <div class="fspd-row">
                <div>
                  <strong>${esc(g.course_id || "-")}</strong>
                  ${g.grade_label ? `<span style="color:var(--color-text-muted,#6b7280);margin-left:8px">${esc(g.grade_label)}</span>` : ""}
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  ${g.grade != null ? `<span style="font-weight:700">${esc(String(g.grade))}${g.grade_letter ? ` (${esc(g.grade_letter)})` : ""}</span>` : ""}
                  <span class="fspd-badge ${g.pass ? "ok" : "bad"}">${g.pass ? "Pass" : "Fail"}</span>
                </div>
              </div>`).join("")}
          </div>
        ` : ""}
      </div>`;

    document.getElementById("fspd-sync-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("fspd-sync-btn");
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Syncing…";
      try {
        await _sb.functions.invoke("moodle-grade-sync", {
          body: { student_id: _sid, email: app.email },
        });
        btn.textContent = "Queued ✓";
        // Refresh Moodle tab after a short delay
        setTimeout(() => {
          if (!document.getElementById(DRAWER_ID)?.getAttribute("aria-hidden") === "true") return;
          tabMoodle().catch(() => {});
        }, 2500);
      } catch (err) {
        btn.textContent = "Failed";
        btn.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------------
     init — call once per page
  ------------------------------------------------------------------ */
  function init({ supabase, userRole }) {
    _sb   = supabase;
    _role = String(userRole || "");
    if (!document.getElementById(DRAWER_ID)) {
      buildShell();
      // Wire close button + overlay + ESC
      document.getElementById("fspd-close").addEventListener("click", close);
      document.getElementById(OVERLAY_ID).addEventListener("click", close);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && document.getElementById(DRAWER_ID)?.getAttribute("aria-hidden") === "false") close();
      });
      // Wire tabs
      document.getElementById("fspd-tabs").addEventListener("click", (e) => {
        const tab = e.target.closest(".fspd-tab");
        if (tab) activateTab(tab.dataset.tab);
      });
    } else {
      // Already injected — just update credentials
      _sb   = supabase;
      _role = String(userRole || "");
    }
  }

  window.FSStudentProfile = { init, open, close };
})();
