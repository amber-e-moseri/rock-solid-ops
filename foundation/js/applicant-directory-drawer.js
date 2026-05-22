(function (global) {
  const Drawer = (global.FSApplicantDirectoryDrawer = global.FSApplicantDirectoryDrawer || {});

  function listRows(ctx, items, renderLabel) {
    const { esc, fmt } = ctx;
    if (!items.length) return `<div class="row muted">No records yet.</div>`;
    return items.map((item) => `<div class="row"><span>${renderLabel(item)}</span><span class="muted">${esc(fmt(item.created_at || item.updated_at || item.timestamp || item.scheduled_for || item.date))}</span></div>`).join("");
  }

  Drawer.renderDrawerContent = function renderDrawerContent(ctx, applicantId) {
    const { state, $, esc, milestoneKeys, milestoneLabels, getClassInfo, getAttendanceSummary, getNotificationRows, getAttendanceStatusCounts, attendanceStatusBadge, displayGroupValue, displaySubgroupValue } = ctx;
    const app = state.applicants.find((a) => String(a.id) === String(applicantId));
    if (!app) return null;
    state.selectedApplicantId = String(app.id);
    state.latestViewedApplicantId = String(app.id);
    const cls = getClassInfo(app.class_option_id);
    const attendance = getAttendanceSummary(app);
    const statusCounts = getAttendanceStatusCounts(app);
    const moodleStatus = state.moodle.find((m) => String(m.applicant_id || m.student_id || "") === String(app.id))?.status || "Unknown";
    $("drawerName").textContent = app.full_name || "Student";
    $("drawerSub").textContent = `${app.email || "-"} · ${app.phone || app.phone_number || "-"}`;
    $("overviewKv").innerHTML = `<div><label>Fellowship</label><strong>${esc(app.fellowship_code || app.fellowship || app.subgroup_id || "-")}</strong></div><div><label>Group / Subgroup</label><strong>${esc(displayGroupValue(app))} / ${esc(displaySubgroupValue(app))}</strong></div><div><label>Assigned Class</label><strong>${esc(app.class_option_id || "-")}</strong></div><div><label>Teacher</label><strong>${esc(cls?.teacher_name || cls?.teacher_id || "-")}</strong></div><div><label>Batch</label><strong>${esc(app.batch_id || cls?.batch_id || "-")}</strong></div><div><label>Moodle Sync</label><strong>${esc(moodleStatus)}</strong></div><div><label>ClickUp Task</label><strong>${esc(app.clickup_task_url || app.clickup_url || "Not linked")}</strong></div>`;
    $("milestoneChips").innerHTML = milestoneKeys.map((k) => `<span class="chip" style="opacity:${app[k] ? 1 : .45}">${esc(milestoneLabels[k])}</span>`).join("");
    $("attendanceKv").innerHTML = `<div><label>Attendance %</label><strong>${attendance.pct == null ? "-" : `${attendance.pct}%`}</strong></div><div><label>Sessions Attended</label><strong>${attendance.attended}/${attendance.total}</strong></div><div><label>Last Attendance</label><strong>${esc(ctx.fmt(attendance.last))}</strong></div><div><label>Missing Sessions</label><strong>${attendance.missing}</strong></div>`;
    $("attendanceKv").insertAdjacentHTML("beforeend", `<div style="grid-column:1/-1"><label>Attendance Session Status</label><div class="chips" style="margin-top:6px">${[attendanceStatusBadge("Submitted", "completed", statusCounts.SUBMITTED), attendanceStatusBadge("Late Start", "unassigned", statusCounts.LATE_START), attendanceStatusBadge("Missing", "duplicate", statusCounts.MISSING)].filter(Boolean).join("") || '<span class="muted">No attendance status rows yet.</span>'}</div></div>`);
    const notifRows = getNotificationRows(app).slice(0, 40);
    $("notificationHistory").innerHTML = listRows(ctx, notifRows, (n) => `${esc(String(n.status || n.event_status || n.provider_status || "PENDING").toUpperCase())} · ${esc(n.event_type || "EVENT")}`);
    const emailRows = state.emails.filter((e) => {
      const aid = String(e.applicant_id || e.student_id || "");
      const aemail = String(e.recipient_email || e.email || "").toLowerCase();
      return (aid && aid === String(app.id)) || (aemail && aemail === String(app.email || "").toLowerCase());
    }).slice(0, 40);
    $("emailHistory").innerHTML = listRows(ctx, emailRows, (e) => `${esc(e.subject || e.template_key || "Email")} · ${esc(String(e.status || "PENDING").toUpperCase())}`);
    const auditRows = state.audits.filter((a) => String(a.entity_id || "") === String(app.id) || String((a.details || {}).applicant_id || "") === String(app.id)).slice(0, 50);
    $("auditHistory").innerHTML = listRows(ctx, auditRows, (a) => `${esc(a.action || "ADMIN_ACTION")} · ${esc(a.actor_email || "staff")}`);
    $("openClickupBtn").disabled = !(app.clickup_task_url || app.clickup_url);
    return app;
  };

  Drawer.openDrawer = function openDrawer(ctx, applicantId) {
    const app = Drawer.renderDrawerContent(ctx, applicantId);
    if (!app) return;
    ctx.$("detailDrawer").classList.add("open");
    ctx.$("drawerOverlay").classList.add("open");
    ctx.$("detailDrawer").setAttribute("aria-hidden", "false");
  };

  Drawer.closeDrawer = function closeDrawer(ctx) {
    ctx.$("detailDrawer").classList.remove("open");
    ctx.$("detailDrawer").setAttribute("aria-hidden", "true");
    if (!ctx.$("classCorrectionModal").classList.contains("open")) ctx.$("drawerOverlay").classList.remove("open");
  };
})(window);
