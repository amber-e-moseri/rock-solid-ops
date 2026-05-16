(function () {
  const KEY = "fs_theme";
  const Shell = (window.FSTeacherShell = window.FSTeacherShell || {});
  function resolveLoginPath() {
    const p = window.location.pathname || "";
    return p.includes("/foundation/") ? "/foundation/auth/login.html" : "/auth/login.html";
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
    localStorage.setItem(KEY, "light");
    localStorage.setItem("fs_admin_theme", "light");
    localStorage.setItem("fs_batch_theme", "light");
    const t = document.getElementById("fs-theme-toggle");
    if (t) t.style.display = "none";
  }

  function initTheme() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem("fs_admin_theme");
      localStorage.removeItem("fs_batch_theme");
    } catch (_) {}
    applyTheme();
  }

  function ensureManrope() {
    if (document.querySelector('link[data-fs-manrope="1"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap";
    l.setAttribute("data-fs-manrope", "1");
    document.head.appendChild(l);
  }

  function inferActiveKey() {
    const p = (window.location.pathname || "").toLowerCase();
    if (p.includes("attendance")) return "attendance";
    if (p.includes("my-class")) return "my-class";
    if (p.includes("availability")) return "availability";
    return "";
  }

  function normalizeTeacherStatus(status, active) {
    const raw = String(status || "").trim().toUpperCase();
    if (raw === "PENDING" || raw === "ACTIVE" || raw === "SUSPENDED" || raw === "INACTIVE") return raw;
    if (raw === "APPROVED") return "ACTIVE";
    if (raw === "REJECTED") return "INACTIVE";
    if (raw === "SUSPENDEDCONFIRMED") return "SUSPENDED";
    return active === true ? "ACTIVE" : "INACTIVE";
  }

  async function enforceTeacherAccess() {
    try {
      const auth = await import("../auth/auth-client.js");
      const session = await auth.getSessionOrNull();
      if (!session) {
        window.location.href = resolveLoginPath();
        return false;
      }

      const profile = await auth.getCurrentProfile();
      const role = String(profile?.role || "").toLowerCase();
      if (auth.isPending(role)) {
        document.body.innerHTML = `<main class="fs-page"><section class="card"><h2 style="margin:0 0 8px;">Access Denied</h2><p>Your account is still pending approval. Please contact an administrator.</p></section></main>`;
        return false;
      }
      if (auth.isAdmin(role) || role === "principal") {
        return true;
      }
      if (!auth.isTeacher(role)) {
        document.body.innerHTML = `<main class="fs-page"><section class="card"><h2 style="margin:0 0 8px;">Access Denied</h2><p>Your account does not have teacher access. Please contact an administrator.</p></section></main>`;
        return false;
      }

      const email = String(session.user?.email || "").trim();
      if (!email) {
        window.location.href = resolveLoginPath();
        return false;
      }

      const { data, error } = await auth.supabase
        .from("teachers")
        .select("teacher_id,status,active,deleted_at")
        .eq("email", email)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        document.body.innerHTML = '<main class="fs-page"><section class="card"><h2 style="margin:0 0 8px;">Access Denied</h2><p>Teacher access record not found.</p></section></main>';
        return false;
      }

      const status = normalizeTeacherStatus(data.status, data.active);
      if (status !== "ACTIVE") {
        document.body.innerHTML = `<main class="fs-page"><section class="card"><h2 style="margin:0 0 8px;">Teacher Access Disabled</h2><p>Your teacher account status is <strong>${status}</strong>. Please contact an administrator.</p></section></main>`;
        return false;
      }
      return true;
    } catch (error) {
      console.error("Teacher access enforcement error:", error);
      document.body.innerHTML = '<main class="fs-page"><section class="card"><h2 style="margin:0 0 8px;">Access Denied</h2><p>Unable to verify your teacher access. Please sign in again or contact your administrator.</p></section></main>';
      return false;
    }
  }

  Shell.mount = function mount(opts) {
    if (window !== window.top) return;
    opts = opts || {};
    document.body.classList.add("fs-force-light");
    const active = opts.active || inferActiveKey();
    const links = [
      { href: "../teacher/index.html?section=attendance", icon: "&#x2705;", label: "Attendance", key: "attendance" },
      { href: "../teacher/index.html?section=my-class", icon: "&#x1F465;", label: "My Class", key: "my-class" },
      { href: "../teacher/index.html?section=availability", icon: "&#x1F4C5;", label: "Availability", key: "availability" },
    ];

    if (!document.querySelector(".fs-shell-nav")) {
      ensureManrope();
      const nav = document.createElement("nav");
      nav.className = "fs-shell-nav";
      nav.innerHTML = `
        <div class="fs-shell-inner">
          <div class="fs-shell-brand">FS</div>
          <div class="fs-shell-links">
            ${links
              .map(
                (l) =>
                  `<a class="fs-shell-link ${l.key === active ? "active" : ""}" href="${l.href}">
                     <span class="fs-shell-link-icon">${l.icon}</span>
                     <span>${l.label}</span>
                   </a>`
              )
              .join("")}
          </div>
          <button id="fs-theme-toggle" class="fs-shell-theme-btn" aria-label="Toggle theme" style="display:none">??</button>
        </div>
      `;
      document.body.prepend(nav);
    }

    const themeBtn = document.getElementById("fs-theme-toggle");
    if (themeBtn) themeBtn.style.display = "none";

    initTheme();
    if (opts.enforceAccess !== false) {
      enforceTeacherAccess();
    }
  };
})();
