(function () {
  const BOOT_STYLE_ID = "fs-shell-boot-opacity-style";
  const existingBootStyle = document.getElementById(BOOT_STYLE_ID);
  if (!existingBootStyle) {
    const bootStyle = document.createElement("style");
    bootStyle.id = BOOT_STYLE_ID;
    bootStyle.textContent = "body { opacity: 0; transition: opacity 150ms ease; }";
    const head = document.head || document.getElementsByTagName("head")[0];
    if (head) head.prepend(bootStyle);
  }
  const mountFailSafeTimer = window.setTimeout(function () {
    document.body.style.opacity = "1";
  }, 2000);

  const THEME_KEY = "fs_admin_theme";
  const COLLAPSE_KEY = "fs_admin_sidebar_collapsed";
  const Shell = (window.FSAdminShell = window.FSAdminShell || {});

  const NAV_SECTIONS = [
    {
      label: "Overview",
      items: [
        { key: "dashboard", label: "Dashboard", href: "admin-dashboard.html", icon: "DB" },
        { key: "portal", label: "Admin Portal", href: "admin-portal.html", icon: "AP" }
      ]
    },
    {
      label: "Operations",
      items: [
        { key: "batch", label: "Batch Management", href: "batch-management.html", icon: "BM" },
        { key: "registrations", label: "Admin Review", href: "admin-review.html", icon: "AR" },
        { key: "applicants", label: "Applicant Dir.", href: "applicant-directory.html", icon: "AD" },
        { key: "dashboards", label: "Dashboards", href: "dashboards.html", icon: "DS" }
      ]
    },
    {
      label: "Teaching",
      items: [
        { key: "attendance", label: "Attendance", href: "TeacherAttendancePortal.html", icon: "AT" },
        { key: "schedule", label: "Schedule", href: "teacher-schedule.html", icon: "SC" },
        { key: "progress", label: "Student Progress", href: "StudentProgressView.html", icon: "SP" }
      ]
    },
    {
      label: "Comms",
      items: [
        { key: "notifications", label: "Notifications", href: "notification-center.html", icon: "NT" },
        { key: "email", label: "Email Campaigns", href: "email-campaigns.html", icon: "EM" }
      ]
    },
    {
      label: "System",
      items: [
        { key: "adminmanagement", label: "Admin Management", href: "admin-management.html", icon: "AM" },
        { key: "failedsyncs", label: "Failed Syncs", href: "failed-sync-retry-center.html", icon: "FS" },
        { key: "health", label: "System Health", href: "system-health.html", icon: "SH" },
        { key: "moodlesettings", label: "Moodle Settings", href: "moodle-settings.html", icon: "MD" },
        { key: "audit", label: "Audit Log", href: "audit-log.html", icon: "LG" },
        { key: "milestones", label: "Milestones", href: "milestones-admin.html", icon: "MS" }
      ]
    }
  ];

  const ADMIN_ONLY_KEYS = new Set([
    "dashboard",
    "portal",
    "batch",
    "registrations",
    "applicants",
    "dashboards",
    "notifications",
    "email",
    "failedsyncs",
    "health",
    "moodlesettings",
    "audit",
    "milestones",
    "adminmanagement",
  ]);
  const TEACHER_KEYS = new Set(["attendance", "schedule", "progress"]);

  function resolveLoginPath() {
    const p = window.location.pathname || "";
    return p.includes("/foundation/") ? "/foundation/auth/login.html" : "/auth/login.html";
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
    try {
      localStorage.setItem(THEME_KEY, "light");
      localStorage.setItem("fs_theme", "light");
      localStorage.setItem("fs_batch_theme", "light");
    } catch (_) {}
  }

  function initTheme() {
    try {
      localStorage.removeItem(THEME_KEY);
      localStorage.removeItem("fs_theme");
      localStorage.removeItem("fs_batch_theme");
    } catch (_) {}
    applyTheme();
  }

  function applyCollapsedState(collapsed) {
    document.body.classList.toggle("fs-shell-collapsed", !!collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch (_) {}
    const btn = document.getElementById("fs-collapse-btn");
    if (btn) {
      btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
      btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
      btn.textContent = collapsed ? ">" : "<";
    }
  }

  function initCollapsedState() {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch (_) {}
    if (window.innerWidth <= 768) collapsed = false;
    applyCollapsedState(collapsed);
  }

  function inferActive() {
    const p = (window.location.pathname || "").toLowerCase();
    if (p.includes("admin-dashboard")) return "dashboard";
    if (p.includes("admin-portal")) return "portal";
    if (p.includes("batch-management")) return "batch";
    if (p.includes("admin-review")) return "registrations";
    if (p.includes("applicant-directory")) return "applicants";
    if (p.includes("teacherattendanceportal")) return "attendance";
    if (p.includes("teacher-schedule")) return "schedule";
    if (p.includes("studentprogressview")) return "progress";
    if (p.includes("notification-center")) return "notifications";
    if (p.includes("email-campaigns")) return "email";
    if (p.includes("failed-sync-retry-center")) return "failedsyncs";
    if (p.includes("system-health")) return "health";
    if (p.includes("moodle-settings")) return "moodlesettings";
    if (p.includes("audit-log")) return "audit";
    if (p.includes("milestones-admin")) return "milestones";
    if (p.includes("admin-management")) return "adminmanagement";
    if (p.includes("dashboards")) return "dashboards";
    return "";
  }

  function buildSidebarHTML(active, badgeCounts, role) {
    const bc = badgeCounts || {};
    const isTeacher = String(role || "").toLowerCase() === "teacher";
    let nav = "";
    NAV_SECTIONS.forEach(function (section) {
      const visibleItems = section.items.filter(function (item) {
        if (isTeacher) return TEACHER_KEYS.has(item.key);
        return true;
      });
      if (!visibleItems.length) return;
      nav += `<div class="sb-label">${section.label}</div>`;
      visibleItems.forEach(function (item) {
        const isActive = item.key === active;
        const badge = bc[item.key] ? `<span class="sb-badge" style="background:var(--amber)">${bc[item.key]}</span>` : "";
        nav += `<a class="sb-link${isActive ? " active" : ""}" href="${item.href}" data-key="${item.key}"><span class="sb-icon">${item.icon}</span> ${item.label}${badge}</a>`;
      });
    });
    return nav;
  }

  function isTeacherBlockedPage(activeKey, role) {
    const isTeacher = String(role || "").toLowerCase() === "teacher";
    if (!isTeacher) return false;
    return ADMIN_ONLY_KEYS.has(activeKey);
  }

  function renderDenied() {
    document.body.innerHTML = `
      <main class="fs-page fs-wrap-narrow" style="padding:32px">
        <section class="card">
          <h2 style="margin:0 0 10px 0">Access Denied</h2>
          <p style="margin:0;color:var(--muted)">Teachers can only access Attendance, Scheduler, and Student Progress.</p>
        </section>
      </main>
    `;
  }

  Shell.mount = async function mount(options) {
    options = options || {};
    if (document.getElementById("fs-admin-sb")) {
      window.clearTimeout(mountFailSafeTimer);
      document.body.style.opacity = "1";
      return;
    }

    // Null-safe config guard: if FS_CONFIG is absent show "Not connected" rather than failing silently.
    if (!options.profileName && (!window.FS_CONFIG || !window.FS_CONFIG.SUPABASE_URL)) {
      options = Object.assign({}, options, { profileName: "Not connected" });
    }

    const active = options.active || inferActive();
    const profileName = options.profileName || "Admin";
    let role = String(options.role || "").toLowerCase();
    if (!role) {
      try {
        const auth = await import("../auth/auth-client.js");
        const profile = await auth.getCurrentProfile();
        role = String(profile?.role || "").toLowerCase();
      } catch (_) {}
    }
    if (isTeacherBlockedPage(active, role)) {
      window.clearTimeout(mountFailSafeTimer);
      document.body.style.opacity = "1";
      renderDenied();
      return;
    }
    const profileInitial = (profileName || "A").trim().charAt(0).toUpperCase();
    const pageTitle = options.pageTitle || document.title || "Admin";
    const badgeCounts = options.badgeCounts || {};

    const sidebar = document.createElement("aside");
    sidebar.className = "fs-shell sidebar";
    sidebar.id = "fs-admin-sb";
    sidebar.innerHTML = `
      <div class="sb-logo">
        <div class="sb-mark">FS</div>
        <div>
          <div class="sb-name">Foundation School</div>
          <div class="sb-sub">Admin Portal</div>
        </div>
      </div>
      <nav class="sb-nav" aria-label="Admin navigation">
        ${buildSidebarHTML(active, badgeCounts, role)}
      </nav>
      <div class="sb-footer">
        <a class="sb-link" href="${resolveLoginPath()}" id="fs-admin-logout">
          <span class="sb-icon">-></span> Sign Out
        </a>
      </div>
    `;

    const topbar = document.createElement("div");
    topbar.className = "fs-topbar topbar";
    topbar.id = "fs-admin-topbar";
    topbar.innerHTML = `
      <div class="fs-topbar-left breadcrumb">
        <span>Admin</span>
        <span class="bc-sep">/</span>
        <span class="bc-now" id="fs-bc-now">${pageTitle}</span>
      </div>
      <div class="fs-topbar-right topbar-r">
        <span class="user-chip">
          <span class="user-av" id="fs-user-av">${profileInitial}</span>
          <span id="fs-user-name">${profileName}</span>
        </span>
        <button class="btn-out" id="fs-collapse-btn" aria-label="Toggle sidebar width" aria-pressed="false"><</button>
        <button class="ham" id="fs-ham" aria-label="Menu" aria-expanded="false">&#9776;</button>
      </div>
    `;

    const overlay = document.createElement("div");
    overlay.className = "s-ov";
    overlay.id = "fs-s-ov";

    document.body.prepend(overlay);
    document.body.prepend(topbar);
    document.body.prepend(sidebar);
    document.body.classList.add("fs-shell-mounted");
    document.body.classList.add("fs-force-light");
    window.clearTimeout(mountFailSafeTimer);
    document.body.style.opacity = "1";

    const mainEl = document.querySelector("main") || document.querySelector("[role='main']") || document.querySelector("#app");
    if (mainEl) {
      if (!mainEl.classList.contains("main")) mainEl.classList.add("main");
      if (!mainEl.classList.contains("fs-content")) mainEl.classList.add("fs-content");
    }

    initTheme();
    initCollapsedState();

    const themeBtn = document.getElementById("fs-theme-btn");
    themeBtn && themeBtn.remove();

    const hamBtn = document.getElementById("fs-ham");
    const collapseBtn = document.getElementById("fs-collapse-btn");
    const sb = document.getElementById("fs-admin-sb");
    const ov = document.getElementById("fs-s-ov");

    function openSidebar() {
      sb.classList.add("open");
      ov.classList.add("show");
      hamBtn && hamBtn.setAttribute("aria-expanded", "true");
    }

    function closeSidebar() {
      sb.classList.remove("open");
      ov.classList.remove("show");
      hamBtn && hamBtn.setAttribute("aria-expanded", "false");
    }

    hamBtn && hamBtn.addEventListener("click", function () {
      sb.classList.contains("open") ? closeSidebar() : openSidebar();
    });
    ov.addEventListener("click", closeSidebar);

    collapseBtn && collapseBtn.addEventListener("click", function () {
      const next = !document.body.classList.contains("fs-shell-collapsed");
      applyCollapsedState(next);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth <= 768) {
        document.body.classList.remove("fs-shell-collapsed");
      } else {
        initCollapsedState();
      }
    });

    const logoutLink = document.getElementById("fs-admin-logout");
    logoutLink && logoutLink.addEventListener("click", async function (e) {
      e.preventDefault();
      if (typeof options.onLogout === "function") {
        await options.onLogout();
      } else if (window.supabase && window.supabase.auth) {
        try { await window.supabase.auth.signOut(); } catch (_) {}
        window.location.href = resolveLoginPath();
      } else {
        window.location.href = resolveLoginPath();
      }
    });
  };

  Shell.setProfile = function (name, initial) {
    const av = document.getElementById("fs-user-av");
    const nm = document.getElementById("fs-user-name");
    if (av) av.textContent = initial || (name || "?").charAt(0).toUpperCase();
    if (nm) nm.textContent = name || "";
  };

  Shell.setPageTitle = function (title) {
    const el = document.getElementById("fs-bc-now");
    if (el) el.textContent = title || "";
  };

  Shell.setBadge = function (key, count) {
    const link = document.querySelector(`.sb-link[data-key="${key}"]`);
    if (!link) return;
    let badge = link.querySelector(".sb-badge");
    if (count) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "sb-badge";
        badge.style.background = "var(--amber)";
        link.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  };
})();
