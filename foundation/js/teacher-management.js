(function teacherManagementPage(global) {
  const FSAdminUi = global.FSAdminUi;
  const FSAdminApi = global.FSAdminApi;

  if (!FSAdminUi || !FSAdminApi) {
    console.error("Missing shared admin modules.");
    return;
  }

  const statusTabs = ["PENDING", "ACTIVE", "SUSPENDED", "INACTIVE", "ALL"];
  const state = {
    profile: null,
    teachers: [],
    filtered: [],
    activeTab: "PENDING",
    loading: false,
  };

  const $ = (id) => document.getElementById(id);
  const roleAllow = new Set(["admin", "superadmin", "subgroup_admin", "pastor"]);

  const isMissingTable = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return error?.code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
  };

  const esc = (s) => FSAdminUi.esc(s);
  const fmtDate = (v) => FSAdminUi.fmtDate(v);
  const notify = (message, type = "info") => {
    if (typeof FSAdminUi.toast === "function") {
      FSAdminUi.toast(message, type);
      return;
    }
    if (global.FSToast?.show) {
      global.FSToast.show(message, type);
      return;
    }
    console[type === "error" ? "error" : "log"](message);
  };

  function statusChip(status) {
    const normalized = FSAdminApi.normalizeTeacherStatus(status, false).toLowerCase();
    return `<span class="chip ${normalized}">${normalized.toUpperCase()}</span>`;
  }

  function setState(message) {
    const stateEl = $("state");
    stateEl.textContent = message;
    stateEl.classList.remove("hidden");
    $("tableWrap").classList.add("hidden");
    $("mobileCards").classList.add("hidden");
  }

  function showData() {
    $("state").classList.add("hidden");
    $("tableWrap").classList.remove("hidden");
    $("mobileCards").classList.remove("hidden");
  }

  function renderTabs() {
    const html = statusTabs
      .map((status) => `<button class="tab ${state.activeTab === status ? "active" : ""}" data-status="${status}">${status}</button>`)
      .join("");
    $("statusTabs").innerHTML = html;
  }

  function actionButtons(row) {
    const normalized = FSAdminApi.normalizeTeacherStatus(row.status, row.active);
    const id = esc(row.teacher_id);
    const emailEsc = esc(row.email || "");
    const linkBtn = `<button class="btn" data-action="linkauth" data-id="${id}" data-email="${emailEsc}" title="Link this teacher's email to their Supabase auth account">Link Auth</button>`;

    if (normalized === "PENDING") {
      return `<div class="actions">
        <button class="btn success" data-action="activate" data-id="${id}">Activate / Approve</button>
        <button class="btn danger" data-action="reject" data-id="${id}">Reject / Deactivate</button>
        ${linkBtn}
      </div>`;
    }

    if (normalized === "ACTIVE") {
      return `<div class="actions">
        <button class="btn" data-action="suspend" data-id="${id}">Suspend</button>
        <button class="btn danger" data-action="deactivate" data-id="${id}">Deactivate</button>
        ${linkBtn}
      </div>`;
    }

    if (normalized === "SUSPENDED") {
      return `<div class="actions">
        <button class="btn success" data-action="unsuspend" data-id="${id}">Unsuspend</button>
        <button class="btn danger" data-action="deactivate" data-id="${id}">Deactivate</button>
        ${linkBtn}
      </div>`;
    }

    return `<div class="actions">${linkBtn}</div>`;
  }

  function applyFilters() {
    const q = String($("searchInput").value || "").trim().toLowerCase();
    const group = String($("groupFilter").value || "").trim().toLowerCase();
    const subgroup = String($("subgroupFilter").value || "").trim().toLowerCase();

    const out = state.teachers.filter((row) => {
      const normalized = FSAdminApi.normalizeTeacherStatus(row.status, row.active);
      if (state.activeTab !== "ALL" && normalized !== state.activeTab) return false;

      const blob = [row.full_name, row.email, row.group_id, row.subgroup_id, normalized].join(" ").toLowerCase();
      if (q && !blob.includes(q)) return false;
      if (group && !String(row.group_id || "").toLowerCase().includes(group)) return false;
      if (subgroup && !String(row.subgroup_id || "").toLowerCase().includes(subgroup)) return false;
      return true;
    });

    state.filtered = out;
    renderRows();
  }

  function renderRows() {
    if (!state.filtered.length) {
      setState("No teachers match the current filters.");
      $("countLabel").textContent = "0 teachers";
      return;
    }

    const rowsHtml = state.filtered
      .map((row) => {
        const normalized = FSAdminApi.normalizeTeacherStatus(row.status, row.active);
        return `<tr>
          <td><strong>${esc(row.full_name || "-")}</strong></td>
          <td>${esc(row.email || "-")}</td>
          <td>${esc(row.group_id || "-")}</td>
          <td>${esc(row.subgroup_id || "-")}</td>
          <td>${statusChip(normalized)}</td>
          <td>${fmtDate(row.created_at)}</td>
          <td>${actionButtons(row)}</td>
        </tr>`;
      })
      .join("");

    const cardsHtml = state.filtered
      .map((row) => {
        const normalized = FSAdminApi.normalizeTeacherStatus(row.status, row.active);
        return `<article class="teacher-card">
          <h3>${esc(row.full_name || "-")}</h3>
          <p>${esc(row.email || "-")}</p>
          <p>Group: ${esc(row.group_id || "-")} | Subgroup: ${esc(row.subgroup_id || "-")}</p>
          <p>${statusChip(normalized)}</p>
          <div class="actions">${actionButtons(row)}</div>
        </article>`;
      })
      .join("");

    $("rows").innerHTML = rowsHtml;
    $("mobileCards").innerHTML = cardsHtml;
    $("countLabel").textContent = `${state.filtered.length} teacher${state.filtered.length === 1 ? "" : "s"}`;
    showData();
  }

  async function loadTeachers() {
    state.loading = true;
    setState("Loading teachers...");

    try {
      const rows = await FSAdminApi.listTeachers(global.supabase, { status: "ALL" });
      state.teachers = rows.map((row) => ({
        ...row,
        status: FSAdminApi.normalizeTeacherStatus(row.status, row.active),
      }));
      applyFilters();
    } catch (error) {
      if (isMissingTable(error)) {
        setState("Teachers table is missing. Run migrations before using Teacher Management.");
      } else {
        setState(`Could not load teachers: ${FSAdminApi.normalizeError(error)}`);
      }
    } finally {
      state.loading = false;
    }
  }

  function wireAddTeacherModal() {
    const addTeacherBtn = $("addTeacherBtn");
    const modalEl = $("addTeacherModal");
    const formEl = $("addTeacherForm");
    const cancelBtn = $("cancelAddTeacherBtn");
    const submitBtn = $("submitAddTeacherBtn");
    const togglePasswordBtn = $("toggleTempPasswordBtn");
    const passwordInput = $("addTeacherTempPassword");
    const resultEl = $("addTeacherResult");
    const resultEmailEl = $("addTeacherResultEmail");
    const resultPasswordEl = $("addTeacherResultPassword");

    if (!addTeacherBtn || !modalEl || !formEl || !cancelBtn || !submitBtn || !togglePasswordBtn || !passwordInput || !resultEl) {
      return;
    }

    const resetModal = () => {
      formEl.reset();
      resultEl.classList.add("hidden");
      resultEmailEl.textContent = "";
      resultPasswordEl.textContent = "";
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Teacher";
      passwordInput.type = "password";
      togglePasswordBtn.textContent = "Show";
    };

    const closeModal = () => {
      global.FSModal?.close?.(modalEl);
      resetModal();
    };

    addTeacherBtn.addEventListener("click", () => {
      resetModal();
      global.FSModal?.open?.(modalEl);
      $("addTeacherFullName")?.focus();
    });

    cancelBtn.addEventListener("click", closeModal);
    global.FSModal?.bindBackdropClose?.(modalEl);
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) closeModal();
    });

    togglePasswordBtn.addEventListener("click", () => {
      const nextType = passwordInput.type === "password" ? "text" : "password";
      passwordInput.type = nextType;
      togglePasswordBtn.textContent = nextType === "password" ? "Show" : "Hide";
    });

    formEl.addEventListener("submit", async (event) => {
      event.preventDefault();

      const fullName = String($("addTeacherFullName")?.value || "").trim();
      const email = String($("addTeacherEmail")?.value || "").trim();
      const tempPassword = String(passwordInput.value || "");
      const phone = String($("addTeacherPhone")?.value || "").trim();
      const groupId = String($("addTeacherGroupId")?.value || "").trim();
      const subgroupId = String($("addTeacherSubgroupId")?.value || "").trim();
      const notes = String($("addTeacherNotes")?.value || "").trim();

      if (!fullName) {
        notify("Full name is required", "error");
        return;
      }
      if (!email || !email.includes("@")) {
        notify("A valid email is required", "error");
        return;
      }
      if (tempPassword.length < 8) {
        notify("Temporary password must be at least 8 characters", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Creating…";

      try {
        const result = await global.FSApi.invokeEdge("teacher-portal-api", {
          action: "createTeacherDirect",
          params: {
            full_name: fullName,
            email,
            temp_password: tempPassword,
            phone,
            group_id: groupId,
            subgroup_id: subgroupId,
            notes,
          },
        });

        if (!result?.ok) {
          notify(result?.error || "Failed", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Teacher";
          return;
        }

        resultEmailEl.textContent = String(result.email || email);
        resultPasswordEl.textContent = String(result.temp_password || tempPassword);
        resultEl.classList.remove("hidden");
        submitBtn.textContent = "Done ✓";
        submitBtn.disabled = true;
        await loadTeachers();
        notify("Teacher account created — share the credentials", "success");
      } catch (error) {
        notify(error?.message || "Failed", "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Teacher";
      }
    });
  }

  function promptReason(label) {
    const text = global.prompt(`${label} reason (optional):`, "");
    if (text === null) return null;
    return String(text).trim();
  }

  async function handleLifecycleAction(action, teacherId, emailHint) {
    if (action === "linkauth") {
      const row = state.teachers.find((t) => String(t.teacher_id) === String(teacherId));
      const teacherEmail = emailHint || row?.email || "";
      if (!teacherEmail) {
        global.FSToast?.show?.("No email on file for this teacher.", "error");
        return;
      }
      try {
        const { data, error } = await global.supabase.rpc("link_teacher_to_auth_user", { teacher_email: teacherEmail });
        if (error) throw error;
        global.FSToast?.show?.(`Auth account linked for ${teacherEmail}.`, "success");
        await loadTeachers();
      } catch (error) {
        const msg = FSAdminApi.normalizeError(error);
        global.FSToast?.show ? global.FSToast.show(msg, "error") : alert(msg);
      }
      return;
    }

    const row = state.teachers.find((t) => String(t.teacher_id) === String(teacherId));
    if (!row) return;

    let nextStatus = "";
    let eventType = "";
    let reason = "";

    if (action === "activate") {
      nextStatus = "ACTIVE";
      eventType = "TEACHER_APPROVED";
    } else if (action === "reject") {
      nextStatus = "INACTIVE";
      eventType = "TEACHER_REJECTED";
    } else if (action === "suspend") {
      nextStatus = "SUSPENDED";
      eventType = "TEACHER_SUSPENDED";
      const inputReason = promptReason("Suspension");
      if (inputReason === null) return;
      reason = inputReason;
    } else if (action === "unsuspend") {
      nextStatus = "ACTIVE";
      eventType = "TEACHER_UNSUSPENDED";
    } else if (action === "deactivate") {
      nextStatus = "INACTIVE";
      eventType = "TEACHER_DEACTIVATED";
    } else {
      return;
    }

    try {
      const updated = await FSAdminApi.updateTeacherStatus(
        global.supabase,
        teacherId,
        nextStatus,
        state.profile?.email || "",
        reason,
      );

      await FSAdminApi.logTeacherAudit(
        global.supabase,
        eventType,
        teacherId,
        {
          from_status: FSAdminApi.normalizeTeacherStatus(row.status, row.active),
          to_status: nextStatus,
          reason: reason || null,
          teacher_name: updated?.full_name || row.full_name || "",
          teacher_email: updated?.email || row.email || "",
        },
        state.profile?.email || "",
      );

      if (global.FSToast?.show) {
        global.FSToast.show(`${row.full_name || "Teacher"} updated to ${nextStatus}.`, "success");
      }
      await loadTeachers();
    } catch (error) {
      const msg = FSAdminApi.normalizeError(error);
      if (global.FSToast?.show) {
        global.FSToast.show(msg, "error");
      } else {
        alert(msg);
      }
    }
  }

  function bindEvents() {
    $("refreshBtn").addEventListener("click", () => loadTeachers());
    $("searchInput").addEventListener("input", applyFilters);
    $("groupFilter").addEventListener("input", applyFilters);
    $("subgroupFilter").addEventListener("input", applyFilters);

    $("statusTabs").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-status]");
      if (!btn) return;
      state.activeTab = String(btn.dataset.status || "ALL").toUpperCase();
      renderTabs();
      applyFilters();
    });

    document.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action][data-id]");
      if (!btn) return;
      handleLifecycleAction(btn.dataset.action, btn.dataset.id, btn.dataset.email);
    });
  }

  async function ensureAccess() {
    const sessionRes = await global.supabase.auth.getSession();
    if (!sessionRes?.data?.session) {
      global.location.href = "login.html";
      return false;
    }

    const profile = await global.getCurrentProfile();
    if (!profile || !roleAllow.has(String(profile.role || ""))) {
      setState("Access denied for this account.");
      return false;
    }

    state.profile = profile;
    return true;
  }

  async function init() {
    try {
      const { supabase, getCurrentProfile } = await import("../auth/auth-client.js");
      global.supabase = supabase;
      global.getCurrentProfile = getCurrentProfile;

      renderTabs();
      bindEvents();
      wireAddTeacherModal();

      const allowed = await ensureAccess();
      if (!allowed) return;

      await loadTeachers();
    } catch (error) {
      setState(`Failed to initialize Teacher Management: ${FSAdminApi.normalizeError(error)}`);
    }
  }

  init();
})(window);
