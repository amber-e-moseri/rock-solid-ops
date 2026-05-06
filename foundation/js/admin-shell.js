(function () {
  const THEME_KEY = "fs_admin_theme";
  const Shell = (window.FSAdminShell = window.FSAdminShell || {});

  const NAV = [
    { key: "dashboard", label: "Dashboard", href: "admin-dashboard.html" },
    { key: "batch", label: "Batch Management", href: "batch-management.html" },
    { key: "registrations", label: "Registrations", href: "applicant-directory.html" },
    { key: "attendance", label: "Attendance", href: "TeacherAttendancePortal.html" },
    { key: "waitlist", label: "Waitlist", href: "applicant-directory.html?status=waitlisted" },
    { key: "notifications", label: "Notifications", href: "notification-center.html" },
    { key: "audit", label: "Audit Logs", href: "audit-log.html" },
    { key: "health", label: "System Health", href: "system-health.html" },
  ];

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.getElementById("fs-admin-theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const auto = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved || auto);
  }

  function inferActive() {
    const p = (window.location.pathname || "").toLowerCase();
    if (p.endsWith("admin-dashboard.html")) return "dashboard";
    if (p.endsWith("batch-management.html")) return "batch";
    if (p.endsWith("applicant-directory.html")) return "registrations";
    if (p.endsWith("teacherattendanceportal.html")) return "attendance";
    if (p.endsWith("notification-center.html")) return "notifications";
    if (p.endsWith("audit-log.html")) return "audit";
    if (p.endsWith("system-health.html")) return "health";
    return "";
  }

  function buildCrumbs(crumbs) {
    if (!Array.isArray(crumbs) || !crumbs.length) return "";
    return crumbs
      .map((c, i) => {
        const name = typeof c === "string" ? c : c?.label || "";
        const link = typeof c === "object" ? c.href : "";
        const node = link ? `<a href="${link}" style="color:inherit;text-decoration:none">${name}</a>` : `<span>${name}</span>`;
        return `${i ? '<span class="fs-admin-shell__sep">/</span>' : ""}${node}`;
      })
      .join("");
  }

  Shell.mount = function mount(options) {
    options = options || {};
    if (document.querySelector(".fs-admin-shell")) return;

    const active = options.active || inferActive();
    const role = options.role || "";
    const profileName = options.profileName || "Admin";
    const profileInitial = (profileName || "A").trim().charAt(0).toUpperCase();
    const shellTitle = options.title || "Foundation School Admin";
    const crumbs = buildCrumbs(options.breadcrumbs || ["Admin"]);
    const navItems = NAV.filter((item) => {
      if (!options.canView || typeof options.canView !== "function") return true;
      return options.canView(item, role) !== false;
    });

    const navMarkup = navItems
      .map((item) => `<a class="fs-admin-shell__link ${item.key === active ? "is-active" : ""}" href="${item.href}" data-key="${item.key}">${item.label}</a>`)
      .join("");

    const root = document.createElement("header");
    root.className = "fs-admin-shell";
    root.innerHTML = `
      <div class="fs-admin-shell__inner">
        <a class="fs-admin-shell__brand" href="admin-dashboard.html" aria-label="Admin home">
          <span class="fs-admin-shell__logo">FS</span>
          <span class="fs-admin-shell__meta">
            <span class="fs-admin-shell__title">${shellTitle}</span>
            <span class="fs-admin-shell__crumbs">${crumbs}</span>
          </span>
        </a>
        <nav class="fs-admin-shell__nav" aria-label="Admin navigation">${navMarkup}</nav>
        <div class="fs-admin-shell__actions">
          <button class="fs-admin-shell__icon-btn" id="fs-admin-theme-toggle" aria-label="Toggle theme">🌙</button>
          <button class="fs-admin-shell__icon-btn" id="fs-admin-notifications" aria-label="Notifications" title="Notifications (coming soon)">🔔</button>
          <div class="fs-admin-shell__profile">
            <button class="fs-admin-shell__profile-btn" id="fs-admin-profile-btn" aria-haspopup="menu" aria-expanded="false">
              <span class="fs-admin-shell__avatar">${profileInitial}</span>
              <span>${profileName}</span>
            </button>
            <div class="fs-admin-shell__menu" id="fs-admin-profile-menu" role="menu">
              <button class="fs-admin-shell__menu-item" id="fs-admin-profile-link" role="menuitem">Profile (soon)</button>
              <button class="fs-admin-shell__menu-item" id="fs-admin-settings-link" role="menuitem">Settings (soon)</button>
              <button class="fs-admin-shell__menu-item" id="fs-admin-logout-link" role="menuitem">Sign Out</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.prepend(root);
    initTheme();

    const themeBtn = document.getElementById("fs-admin-theme-toggle");
    const profileBtn = document.getElementById("fs-admin-profile-btn");
    const profileMenu = document.getElementById("fs-admin-profile-menu");
    const logoutBtn = document.getElementById("fs-admin-logout-link");
    const notificationsBtn = document.getElementById("fs-admin-notifications");

    themeBtn?.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    profileBtn?.addEventListener("click", () => {
      const open = profileMenu?.classList.toggle("open");
      profileBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
      if (!profileMenu || !profileBtn) return;
      if (profileMenu.contains(e.target) || profileBtn.contains(e.target)) return;
      profileMenu.classList.remove("open");
      profileBtn.setAttribute("aria-expanded", "false");
    });

    notificationsBtn?.addEventListener("click", () => {
      if (typeof options.onNotificationsClick === "function") {
        options.onNotificationsClick();
      } else if (window.FSToast?.info) {
        window.FSToast.info("Notifications panel is coming soon.");
      }
    });

    logoutBtn?.addEventListener("click", async () => {
      if (typeof options.onLogout === "function") {
        await options.onLogout();
      } else if (window.supabase?.auth?.signOut) {
        await window.supabase.auth.signOut();
        window.location.href = "login.html";
      }
    });
  };
})();
