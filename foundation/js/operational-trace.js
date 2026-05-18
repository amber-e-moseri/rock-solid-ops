export function initOperationalTrace({
  supabase,
  adminApi,
  adminUi,
  isAdmin,
  getCurrentProfile,
  getSessionOrNull,
}) {
  const $ = (id) => document.getElementById(id);

  const els = {
    card: $("operationalTraceCard"),
    lookup: $("traceLookup"),
    runBtn: $("runTraceBtn"),
    state: $("traceState"),
    list: $("traceTimeline"),
  };

  if (!els.runBtn || !els.card || !els.lookup || !els.state || !els.list) return;

  const safe = (v) => adminUi?.esc ? adminUi.esc(String(v ?? "")) : String(v ?? "");

  const setState = (msg, kind = "info", raw = "") => {
    const cls = kind === "error"
      ? "fs-banner fs-banner-danger"
      : kind === "warn"
      ? "fs-banner fs-banner-warning"
      : "fs-banner fs-banner-info";
    const rawBlock = raw
      ? `<details><summary>Raw Error</summary><pre>${safe(raw)}</pre></details>`
      : "";
    els.state.className = cls;
    els.state.innerHTML = `<span>${safe(msg)}</span>${rawBlock}`;
    els.state.classList.remove("hidden");
  };

  const hideState = () => els.state.classList.add("hidden");
  const hideTracePanel = () => els.card.classList.add("hidden");

  const sourceDotColor = (source) => {
    const s = String(source || "").toLowerCase();
    if (s.includes("applicant")) return "#7c3aed";
    if (s.includes("notification")) return "#2563eb";
    if (s.includes("moodle")) return "#16a34a";
    if (s.includes("email")) return "#d97706";
    return "#6b7280";
  };

  const badgeClass = (status) => {
    const s = String(status || "").toUpperCase();
    if (s.includes("FAIL") || s.includes("ERROR") || s.includes("DENIED")) return "fs-badge-danger";
    if (s.includes("WARN") || s.includes("RETRY") || s.includes("PENDING")) return "fs-badge-warning";
    if (s.includes("SKIP")) return "fs-badge-neutral";
    if (s.includes("PASS") || s.includes("SUCCESS") || s.includes("SENT") || s.includes("SYNC") || s.includes("ASSIGNED")) return "fs-badge-success";
    return "fs-badge-info";
  };

  const fmtTs = (v) => {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  };

  const renderLoadingRows = () => {
    const skeleton = Array.from({ length: 4 }).map(() => `
      <article class="fs-card-sm">
        <div class="fs-card-header">
          <span>Loading...</span>
          <span class="fs-badge fs-badge-neutral">PENDING</span>
        </div>
        <div class="fs-banner fs-banner-info">Fetching event details...</div>
      </article>
    `).join("");
    els.list.innerHTML = skeleton;
    els.list.classList.remove("hidden");
  };

  const renderRows = (rows) => {
    els.list.innerHTML = rows.map((row) => {
      const dot = sourceDotColor(row.source);
      return `
        <article class="fs-card-sm" style="margin-bottom:10px;">
          <div class="fs-card-header" style="align-items:center;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${dot};"></span>
              <strong>${safe(row.event_type || "EVENT")}</strong>
              <span class="fs-badge fs-badge-neutral">${safe(row.source || "unknown")}</span>
            </div>
            <span class="fs-badge ${badgeClass(row.status)}">${safe(row.status || "UNKNOWN")}</span>
          </div>
          <div style="margin-bottom:8px;color:var(--color-text-muted);font-size:12px;">${safe(fmtTs(row.event_time))}</div>
          <details>
            <summary>Details</summary>
            <pre>${safe(JSON.stringify(row.details ?? {}, null, 2))}</pre>
          </details>
        </article>
      `;
    }).join("");
    els.list.classList.remove("hidden");
  };

  const ensureAdminAccess = async () => {
    const session = await getSessionOrNull();
    if (!session) return false;

    const adminCheck = await supabase.rpc("is_admin");
    if (adminCheck?.error || !adminCheck?.data) return false;

    const profile = await getCurrentProfile();
    const role = String(profile?.role || "").trim().toLowerCase();
    const strictAdmin = role === "admin" || role === "superadmin";
    if (!profile || !profile.is_active || !isAdmin?.(profile.role) || !strictAdmin) {
      return false;
    }
    return true;
  };

  const runTrace = async () => {
    const allowed = await ensureAdminAccess();
    if (!allowed) return;

    const lookup = String(els.lookup.value || "").trim();
    if (!lookup) {
      setState("Enter an email or ID to look up.", "warn");
      els.list.classList.add("hidden");
      return;
    }

    setState("Loading trace...", "info");
    renderLoadingRows();
    els.runBtn.disabled = true;

    try {
      const { data, error } = await supabase.rpc("get_operational_trace", { lookup });

      if (error) {
        setState("Trace unavailable — check console.", "error", adminApi.normalizeError(error));
        console.error("OPER_TRACE_RPC_ERROR", error);
        els.list.classList.add("hidden");
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        setState("No trace found for this lookup.", "info");
        els.list.classList.add("hidden");
        return;
      }

      renderRows(rows);
      hideState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || "Trace request failed");
      setState("Trace unavailable — check console.", "error", msg);
      console.error("OPER_TRACE_FETCH_ERROR", err);
      els.list.classList.add("hidden");
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
