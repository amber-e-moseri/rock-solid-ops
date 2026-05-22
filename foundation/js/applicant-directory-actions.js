(function (global) {
  const Actions = (global.FSApplicantDirectoryActions = global.FSApplicantDirectoryActions || {});

  Actions.sendEmail = function sendEmail(ctx, applicantId) {
    const { state } = ctx;
    const app = state.applicants.find((a) => String(a.id) === String(applicantId || ""));
    if (!app) return;
    if (!app.email) { ctx.showFlash("Selected applicant does not have an email address.", "warn"); return; }
    if (!window.FSDirectEmail?.open) { ctx.showFlash("Direct email modal is not available.", "error"); return; }
    window.FSDirectEmail.open({ email: app.email, name: app.full_name || "" });
  };

  Actions.exportData = function exportData(ctx) {
    const ids = ctx.state.selectedIds.size > 0 ? ctx.state.selectedIds : null;
    const rows = ids ? ctx.state.applicants.filter((a) => ids.has(String(a.id))) : ctx.filteredApplicants();
    const cols = ["full_name", "email", "phone", "fellowship_code", "class_option_id", "batch_id", "status", "registration_status", "created_at"];
    const csv = [cols.join(","), ...rows.map((a) => cols.map((c) => `"${String(a[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `applicants-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  Actions.bulkAction = async function bulkAction(ctx, kind, value) {
    if (!value || !ctx.state.selectedIds.size) return;
    const { state, supabase } = ctx;
    const ids = [...state.selectedIds];
    const now = new Date().toISOString();
    const bulkOpId = crypto.randomUUID();
    const prog = ctx.$("bulkProgress");
    prog.style.display = "inline";
    let done = 0;
    for (const id of ids) {
      const app = state.applicants.find((a) => String(a.id) === id);
      if (!app) continue;
      if (kind === "status") {
        const { error } = await supabase.from("applicants").update({ status: value, registration_status: value, updated_at: now }).eq("id", id);
        if (!error) await supabase.from("audit_logs").insert({ action: "BULK_STATUS_CHANGE", entity_type: "applicant", entity_id: id, actor_email: state.auth?.profile?.email || null, status: "SUCCESS", details: { old_status: app.status || app.registration_status, new_status: value, bulk_operation_id: bulkOpId }, created_at: now });
      }
      if (kind === "class") {
        const cls = ctx.getClassInfo(value);
        if (!cls) continue;
        const patch = { class_option_id: value, registration_status: "ASSIGNED", assigned_at: now, updated_at: now };
        if (cls.batch_id) patch.batch_id = cls.batch_id;
        const { error } = await supabase.from("applicants").update(patch).eq("id", id);
        if (!error) {
          await supabase.from("moodle_enrollment_sync").update({ class_option_id: value, sync_status: "PENDING", updated_at: now }).eq("applicant_id", id);
          await supabase.from("audit_logs").insert({ action: "BULK_CLASS_REASSIGNMENT", entity_type: "applicant", entity_id: id, actor_email: state.auth?.profile?.email || null, status: "SUCCESS", details: { old_class: app.class_option_id, new_class: value, bulk_operation_id: bulkOpId }, created_at: now });
        }
      }
      done++; prog.textContent = `${done}/${ids.length}…`;
    }
    prog.style.display = "none";
    state.selectedIds.clear();
    if (kind === "status") ctx.$("bulkStatusSelect").value = "";
    if (kind === "class") ctx.$("bulkClassSelect").value = "";
    await ctx.loadData();
    ctx.showFlash(kind === "status" ? `Bulk status updated to ${value} for ${done} applicants.` : `Bulk class change to ${value} for ${done} applicants.`);
  };

  Actions.updateBulkBar = function updateBulkBar(ctx) {
    const bar = ctx.$("bulkBar"); if (!bar) return;
    const count = ctx.state.selectedIds.size;
    bar.style.display = count ? "flex" : "none";
    ctx.$("bulkCount").textContent = `${count} selected`;
    const sel = ctx.$("bulkClassSelect");
    if (sel && sel.options.length <= 1) ctx.state.classOptions.filter((c) => c.active !== false).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = ctx.classIdOf(c);
      opt.textContent = `${ctx.classIdOf(c)} · ${c.teacher_name || ""} · ${c.day || ""} ${c.class_time || ""}`.trim();
      sel.appendChild(opt);
    });
  };
})(window);
