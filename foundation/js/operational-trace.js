export function initOperationalTrace({
  supabase,
  adminApi,
  adminUi,
  roleAllow,
  getCurrentProfile,
  getSessionOrNull,
}) {
  const $ = (id) => document.getElementById(id);

  const els = {
    card: $("operationalTraceCard"),
    email: $("traceEmail"),
    applicantId: $("traceApplicantId"),
    studentId: $("traceStudentId"),
    registrationId: $("traceRegistrationId"),
    runBtn: $("runTraceBtn"),
    state: $("traceState"),
    resolved: $("traceResolved"),
    tableWrap: $("traceTableWrap"),
    rows: $("traceRows"),
  };

  if (!els.runBtn || !els.card) return;

  const setState = (msg) => {
    els.state.textContent = msg;
    els.state.classList.remove("hidden");
  };

  const hideState = () => els.state.classList.add("hidden");
  const hideTracePanel = () => els.card.classList.add("hidden");

  const safe = (v) => adminUi?.esc ? adminUi.esc(String(v ?? "")) : String(v ?? "");

  const badgeClass = (status) => {
    const s = String(status || "").toUpperCase();
    if (s.includes("FAIL") || s.includes("ERROR") || s.includes("DENIED")) return "fs-badge-danger";
    if (s.includes("WARN") || s.includes("RETRY") || s.includes("PENDING")) return "fs-badge-warning";
    if (s.includes("SKIP")) return "fs-badge-neutral";
    if (s.includes("PASS") || s.includes("SUCCESS") || s.includes("SENT") || s.includes("SYNC")) return "fs-badge-success";
    return "fs-badge-info";
  };

  const fmtTs = (v) => {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  };

  const copyId = async (value) => {
    const val = String(value || "").trim();
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
    } catch (_) {
      // no-op
    }
  };

  const readInputs = () => {
    const email = String(els.email.value || "").trim().toLowerCase() || null;
    const applicantId = String(els.applicantId.value || "").trim() || null;
    const studentId = String(els.studentId.value || "").trim() || null;
    const registrationId = String(els.registrationId.value || "").trim() || null;
    return { email, applicantId, studentId, registrationId };
  };

  const renderRows = (rows) => {
    els.rows.innerHTML = rows.map((row, idx) => {
      const reg = row.registration_id || "";
      const app = row.applicant_id || "";
      const stu = row.student_id || "";
      const detailsId = `traceDetails${idx}`;
      return `
        <tr>
          <td>${safe(fmtTs(row.event_ts))}</td>
          <td><span class="trace-source">${safe(row.source_table || "-")}</span></td>
          <td>${safe(row.event_type || "-")}</td>
          <td><span class="fs-badge ${badgeClass(row.status)}">${safe(row.status || "UNKNOWN")}</span></td>
          <td>
            <div><strong>R:</strong> ${safe(reg || "-")} ${reg ? `<button class="copy-id" data-copy="${safe(reg)}">Copy</button>` : ""}</div>
            <div><strong>S:</strong> ${safe(stu || "-")} ${stu ? `<button class="copy-id" data-copy="${safe(stu)}">Copy</button>` : ""}</div>
            <div><strong>A:</strong> ${safe(app || "-")} ${app ? `<button class="copy-id" data-copy="${safe(app)}">Copy</button>` : ""}</div>
          </td>
          <td>${safe(row.summary || "-")}</td>
          <td class="trace-details">
            <details id="${detailsId}">
              <summary>Expand JSON</summary>
              <pre>${safe(JSON.stringify(row.details ?? {}, null, 2))}</pre>
            </details>
          </td>
        </tr>
      `;
    }).join("");

    els.rows.querySelectorAll("button[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const val = btn.getAttribute("data-copy") || "";
        await copyId(val);
      });
    });
  };

  const ensureAdminAccess = async () => {
    const session = await getSessionOrNull();
    if (!session) return false;

    const adminCheck = await supabase.rpc("is_admin");
    if (adminCheck?.error || !adminCheck?.data) return false;

    const profile = await getCurrentProfile();
    if (!profile || !profile.is_active || !roleAllow.has(String(profile.role || ""))) {
      return false;
    }
    return true;
  };

  const runTrace = async () => {
    const allowed = await ensureAdminAccess();
    if (!allowed) return;

    const params = readInputs();
    if (!params.email && !params.applicantId && !params.studentId && !params.registrationId) {
      setState("Enter at least one identifier to run trace.");
      els.tableWrap.classList.add("hidden");
      return;
    }

    els.resolved.classList.add("hidden");
    els.tableWrap.classList.add("hidden");
    setState("Running operational trace...");
    els.runBtn.disabled = true;

    try {
      const { data, error } = await supabase.rpc("get_operational_trace", {
        p_email: params.email,
        p_applicant_id: params.applicantId,
        p_student_id: params.studentId,
        p_registration_id: params.registrationId,
        p_limit: 500,
      });

      if (error) {
        setState(`Trace request failed: ${safe(adminApi.normalizeError(error))}`);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        setState("No trace events found for the provided identifiers.");
        return;
      }

      const firstResolved = rows.find((r) => r.registration_id || r.applicant_id || r.student_id || r.email);
      if (firstResolved) {
        const resolvedText = `Resolved context - registration_id: ${firstResolved.registration_id || "n/a"}, applicant_id: ${firstResolved.applicant_id || "n/a"}, student_id: ${firstResolved.student_id || "n/a"}, email: ${firstResolved.email || "n/a"}`;
        els.resolved.textContent = resolvedText;
        els.resolved.classList.remove("hidden");
      }

      renderRows(rows);
      hideState();
      els.tableWrap.classList.remove("hidden");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || "Trace request failed");
      setState(`Trace request failed: ${safe(msg)}`);
    } finally {
      els.runBtn.disabled = false;
    }
  };

  els.runBtn.addEventListener("click", () => {
    runTrace();
  });

  ensureAdminAccess()
    .then((allowed) => {
      if (!allowed) hideTracePanel();
    })
    .catch(() => {
      hideTracePanel();
    });
}
