(function () {
  const KEY = "fs_theme";
  const Shell = (window.FSTeacherShell = window.FSTeacherShell || {});

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
    const t = document.getElementById("fs-theme-toggle");
    if (t) t.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  function initTheme() {
    const saved = localStorage.getItem(KEY);
    const preferred = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(preferred);
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
    if (p.endsWith("/teacherattendanceportal.html") || p.endsWith("teacherattendanceportal.html")) return "attendance";
    if (p.endsWith("/studentprogressview.html") || p.endsWith("studentprogressview.html")) return "progress";
    if (p.endsWith("/teacher-schedule.html") || p.endsWith("teacher-schedule.html")) return "schedule";
    return "";
  }

  Shell.mount = function mount(opts) {
    opts = opts || {};
    const active = opts.active || inferActiveKey();
    const links = [
      { href: "TeacherAttendancePortal.html", icon: "✅", label: "Attendance", key: "attendance" },
      { href: "StudentProgressView.html", icon: "📊", label: "Student Progress", key: "progress" },
      { href: "teacher-schedule.html", icon: "🗓️", label: "My Schedule", key: "schedule" },
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
          <button id="fs-theme-toggle" class="fs-shell-theme-btn" aria-label="Toggle theme">🌙</button>
        </div>
      `;
      document.body.prepend(nav);
    }

    const themeBtn = document.getElementById("fs-theme-toggle");
    if (themeBtn && !themeBtn.dataset.bound) {
      themeBtn.dataset.bound = "1";
      themeBtn.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "light";
        applyTheme(cur === "dark" ? "light" : "dark");
      });
    }

    initTheme();
  };
})();
