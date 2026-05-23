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
    <button class="fspd-tab" data-tab="attendance"  style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Attendance</button>
    <button class="fspd-tab" data-tab="milestones"  style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Milestones</button>
    <button class="fspd-tab" data-tab="overview"    style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Overview</button>
    <button id="fspd-tab-moodle" class="fspd-tab" data-tab="moodle" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Moodle</button>
    <button id="fspd-tab-graduation" class="fspd-tab" data-tab="graduation" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;color:var(--color-text-muted,#6b7280)">Graduation</button>
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

    // Hide Moodle tab for teachers; hide Graduation tab for non-admin roles
    const moodleTab = document.getElementById("fspd-tab-moodle");
    if (moodleTab) moodleTab.style.display = isTeacher(_role) ? "none" : "";
    const gradTab = document.getElementById("fspd-tab-graduation");
    if (gradTab) gradTab.style.display = isAdminLike(_role) ? "" : "none";

    activateTab(options.initialTab || "attendance");
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
      else if (name === "graduation")  await tabGraduation();
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

  async function resolveActiveClassOption(app) {
    const direct = app?.class_option_id || null;
    if (direct) return String(direct);

    // Resolve linked student_id from applicant email when applicant.id != students.student_id
    let linkedStudentId = null;
    try {
      if (app?.email) {
        const { data: studentRows } = await _sb
          .from("students")
          .select("student_id,class_option_id")
          .eq("email", app.email)
          .limit(1);
        const linked = studentRows?.[0];
        if (linked?.class_option_id) return String(linked.class_option_id);
        linkedStudentId = linked?.student_id || null;
      }
    } catch (_) {}

    const lookupStudentId = linkedStudentId || _sid;

    // Fallback 1: active roster row
    try {
      const { data: roster } = await _sb
        .from("class_roster")
        .select("class_option_id,status,updated_at")
        .eq("student_id", lookupStudentId)
        .eq("status", "Active")
        .order("updated_at", { ascending: false })
        .limit(1);
      const rosterClass = roster?.[0]?.class_option_id;
      if (rosterClass) return String(rosterClass);
    } catch (_) {}

    // Fallback 2: latest attendance class
    try {
      const { data: att } = await _sb
        .from("attendance_log")
        .select("class_option_id,class_date,created_at")
        .eq("student_id", lookupStudentId)
        .not("class_option_id", "is", null)
        .order("class_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const attClass = att?.[0]?.class_option_id;
      if (attClass) return String(attClass);
    } catch (_) {}

    return null;
  }

  async function fetchFocusSummary(app) {
    let linkedStudentId = null;
    try {
      if (app?.email) {
        const { data: studentRows } = await _sb
          .from("students")
          .select("student_id")
          .eq("email", app.email)
          .limit(1);
        linkedStudentId = studentRows?.[0]?.student_id || null;
      }
    } catch (_) {}
    const lookupStudentId = linkedStudentId || _sid;

    let attendanceRows = [];
    try {
      const { data: rec } = await _sb
        .from("attendance_records")
        .select("present,class_date")
        .eq("applicant_id", _sid)
        .order("class_date", { ascending: false })
        .limit(200);
      if (rec?.length) {
        attendanceRows = rec;
      } else {
        const { data: log } = await _sb
          .from("attendance_log")
          .select("present,class_date")
          .eq("student_id", lookupStudentId)
          .order("class_date", { ascending: false })
          .limit(200);
        attendanceRows = log || [];
      }
    } catch (_) {}

    let milestoneRows = [];
    try {
      const { data } = await _sb
        .from("student_milestone_status")
        .select("status,completed")
        .eq("applicant_id", _sid)
        .limit(500);
      milestoneRows = data || [];
    } catch (_) {}

    const attendanceTotal = attendanceRows.length;
    const attendancePresent = attendanceRows.filter((r) => r.present === true || r.present === 1).length;
    const attendancePct = attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

    const milestoneTotal = milestoneRows.length;
    const milestoneDone = milestoneRows.filter((m) => m.status === "completed" || m.completed === true).length;
    const milestonePct = milestoneTotal ? Math.round((milestoneDone / milestoneTotal) * 100) : 0;

    return {
      attendanceTotal,
      attendancePresent,
      attendancePct,
      milestoneTotal,
      milestoneDone,
      milestonePct,
    };
  }

  /* ------------------------------------------------------------------
     Tab: Overview
  ------------------------------------------------------------------ */
  async function tabOverview() {
    const app = await fetchApplicant();
    const activeClassOption = await resolveActiveClassOption(app);
    const focus = await fetchFocusSummary(app);

    document.getElementById("fspd-name").textContent = app.full_name || "Student";
    document.getElementById("fspd-sub").textContent =
      `${app.email || "-"} · ${app.phone || app.phone_number || "-"}`;

    const fields = [
      ["Fellowship",       app.fellowship_code || app.fellowship_name || "-"],
      ["Group / Subgroup", `${app.group_id || "-"} / ${app.subgroup_id || "-"}`],
      ["Assigned Class",   activeClassOption || "Not assigned"],
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

    body().innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;color:var(--color-text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px">At a glance</div>
        <div class="fspd-stat-grid" style="margin-bottom:0">
          <div class="fspd-stat">
            <div class="lbl">Attendance</div>
            <div class="val">${focus.attendancePct}%</div>
            <div style="font-size:11px;color:var(--color-text-muted,#6b7280)">${focus.attendancePresent}/${focus.attendanceTotal} present</div>
          </div>
          <div class="fspd-stat">
            <div class="lbl">Milestones</div>
            <div class="val">${focus.milestonePct}%</div>
            <div style="font-size:11px;color:var(--color-text-muted,#6b7280)">${focus.milestoneDone}/${focus.milestoneTotal} complete</div>
          </div>
          <div class="fspd-stat">
            <div class="lbl">Active Class</div>
            <div class="val" style="font-size:16px;line-height:1.2">${esc(activeClassOption || "None")}</div>
            <div style="font-size:11px;color:var(--color-text-muted,#6b7280)">current placement</div>
          </div>
        </div>
      </div>
      <div class="fspd-kv">${
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
    const app = await fetchApplicant();
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
      </div>

      <!-- Makeup Queue section -->
      <div id="fspd-makeup-section" style="margin-top:16px"></div>`;

    // Async: load and render makeup queue below the attendance table
    fetchMakeupQueue(app).then((html) => {
      const el = document.getElementById("fspd-makeup-section");
      if (el) el.innerHTML = html;
    }).catch(() => {});
  }

  async function fetchMakeupQueue(app) {
    // Bridge applicant → students.student_id via email
    const { data: stuRows } = await _sb
      .from("students").select("student_id").eq("email", app.email).limit(1);
    const studentId = stuRows?.[0]?.student_id;
    if (!studentId) return "";

    const { data: makeups } = await _sb
      .from("makeup_queue")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!makeups?.length) return "";

    const pending   = makeups.filter((m) => !m.makeup_completed).length;
    const completed = makeups.filter((m) =>  m.makeup_completed).length;
    const TODAY     = new Date().toISOString().slice(0, 10);

    return `
      <div style="border-top:1px solid var(--color-border,#e5e7eb);padding-top:12px;margin-top:4px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted,#6b7280);margin-bottom:8px">
          Makeup Queue — ${pending} pending · ${completed} completed
        </div>
        <div style="display:grid;gap:6px">
          ${makeups.map((m) => {
            const overdue = !m.makeup_completed && m.deadline && m.deadline < TODAY;
            const bg  = m.makeup_completed ? "#dcfce7" : overdue ? "#fee2e2" : "#fef9c3";
            const fg  = m.makeup_completed ? "#166534" : overdue ? "#991b1b" : "#854d0e";
            const lbl = m.makeup_completed ? "Completed" : overdue ? "Overdue" : "Pending";
            return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--color-border,#e5e7eb);border-radius:8px;font-size:12px">
              <div>
                <span style="font-weight:700">Class ${esc(m.class_number)}</span>
                ${m.deadline ? `<span style="color:var(--color-text-muted,#6b7280);margin-left:6px">Due ${esc(m.deadline)}</span>` : ""}
                ${m.completed_date ? `<span style="color:#166534;margin-left:6px">Done ${esc(m.completed_date)}</span>` : ""}
              </div>
              <span style="display:inline-flex;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:${bg};color:${fg}">${lbl}</span>
            </div>`;
          }).join("")}
        </div>
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
     Tab: Graduation eligibility
  ------------------------------------------------------------------ */
  async function tabGraduation() {
    const app = await fetchApplicant();

    const { data: ge, error } = await _sb
      .from("graduation_eligibility")
      .select("*")
      .eq("applicant_id", _sid)
      .maybeSingle();

    if (error) throw error;

    const gates = [
      { label: "Attendance (≥ 6 sessions)",      key: "gate1_attendance" },
      { label: "Moodle course complete",          key: "gate2_moodle_complete" },
      { label: "Core milestones met",             key: "gate3_milestones_met" },
      { label: "Exam grade ≥ 70%",               key: "gate4_exam_passed" },
    ];

    const finalEligible = ge
      ? (ge.override_eligible != null ? ge.override_eligible : ge.eligible)
      : null;

    const statusBadge = !ge
      ? `<span style="display:inline-flex;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#f3f4f6;color:#6b7280">Not Evaluated</span>`
      : ge.override_eligible != null
        ? `<span style="display:inline-flex;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#ede9fe;color:#5b21b6">${ge.override_eligible ? "Eligible (Override)" : "Not Eligible (Override)"}</span>`
        : finalEligible
          ? `<span style="display:inline-flex;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#dcfce7;color:#166534">Eligible</span>`
          : `<span style="display:inline-flex;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#fee2e2;color:#991b1b">Not Eligible</span>`;

    body().innerHTML = `
      <div style="display:grid;gap:12px">
        <div style="background:var(--color-surface-raised,#f9fafb);border:1px solid var(--color-border,#e5e7eb);border-radius:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted,#6b7280)">Eligibility</div>
            ${statusBadge}
          </div>
          ${gates.map((g) => {
            const pass = ge?.[g.key] === true;
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border,#e5e7eb);font-size:13px">
              <span>${esc(g.label)}</span>
              <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:12px;font-weight:700;background:${pass ? "#dcfce7" : "#fee2e2"};color:${pass ? "#166534" : "#991b1b"}">${pass ? "✓" : "✗"}</span>
            </div>`;
          }).join("")}
          ${ge?.override_reason ? `<div style="margin-top:10px;font-size:12px;color:var(--color-text-muted,#6b7280)">Override reason: ${esc(ge.override_reason)}</div>` : ""}
          ${ge?.last_evaluated_at ? `<div style="margin-top:4px;font-size:11px;color:var(--color-text-muted,#6b7280)">Last evaluated: ${new Date(ge.last_evaluated_at).toLocaleDateString()}</div>` : ""}
        </div>

        ${isAdminLike(_role) ? `
          <button id="fspd-grad-eval-btn" style="
            padding:8px 14px;border-radius:8px;border:1px solid var(--color-primary,#4C2A92);
            background:var(--color-primary,#4C2A92);color:#fff;font:600 13px/1.4 inherit;cursor:pointer
          ">Re-evaluate Now</button>
        ` : ""}
      </div>`;

    document.getElementById("fspd-grad-eval-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("fspd-grad-eval-btn");
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Evaluating…";
      try {
        await _sb.rpc("evaluate_graduation_eligibility", { p_applicant_id: _sid });
        btn.textContent = "Done ✓";
        setTimeout(() => tabGraduation().catch(() => {}), 800);
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
