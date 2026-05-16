import { isAdmin, isTeacher } from "./auth-client.js";

export function renderRoleSidebar(profile, containerId = "roleSidebar") {
  const root = document.getElementById(containerId);
  if (!root) return;
  const appPath = (relativePath) => {
    const clean = String(relativePath || "").replace(/^\/+/, "");
    const p = window.location.pathname || "";
    return p.includes("/foundation/") ? `/foundation/${clean}` : `/${clean}`;
  };

  const role = String(profile?.role || "").toLowerCase();
  const canAdmin = isAdmin(role);
  const canPrincipal = isAdmin(role) || role === "principal";
  const canTeacher = isTeacher(role) || isAdmin(role);

  const sections = [
    {
      title: "Main",
      items: [
        { label: "Dashboard", href: appPath("staff/admin-dashboard.html"), show: canPrincipal },
        { label: "Students", href: appPath("staff/StudentProgressView.html"), show: canPrincipal },
        { label: "Teachers", href: appPath("staff/teacher-schedule.html"), show: canPrincipal },
        { label: "Classes", href: appPath("staff/batch-management.html"), show: canTeacher },
        { label: "Calendar", href: appPath("staff/dashboards.html"), show: canPrincipal },
      ],
    },
    {
      title: "Operations",
      items: [
        { label: "Attendance", href: appPath("staff/TeacherAttendancePortal.html"), show: canTeacher },
        { label: "Batch Management", href: appPath("staff/batch-management.html"), show: canPrincipal },
        { label: "Registrations", href: appPath("staff/admin-review.html"), show: canPrincipal },
        { label: "Milestones", href: appPath("staff/StudentProgressView.html"), show: canPrincipal },
        { label: "Notifications", href: appPath("staff/notification-center.html"), show: canAdmin },
      ],
    },
    {
      title: "Insights",
      items: [
        { label: "Reports", href: appPath("staff/dashboards.html"), show: canPrincipal },
        { label: "Analytics", href: appPath("staff/dashboards.html"), show: canPrincipal },
        { label: "Audit Logs", href: appPath("staff/audit-log.html"), show: canPrincipal },
        { label: "System Health", href: appPath("staff/system-health.html"), show: canAdmin },
      ],
    },
    {
      title: "Integrations",
      items: [
        { label: "Moodle", href: appPath("staff/system-health.html"), show: canAdmin },
        { label: "Mailchimp", href: appPath("staff/email-campaigns.html"), show: canAdmin },
        { label: "ClickUp", href: appPath("staff/system-health.html"), show: canAdmin },
      ],
    },
    {
      title: "Settings",
      items: [
        { label: "Roles", href: appPath("staff/admin-portal.html"), show: canAdmin },
        { label: "Preferences", href: appPath("staff/admin-portal.html"), show: canTeacher },
        { label: "Logout", href: "#logout", show: canTeacher, logout: true },
      ],
    },
  ];

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.show),
    }))
    .filter((section) => section.items.length > 0);

  if (!visibleSections.length) {
    root.innerHTML = `<span class="text-xs text-fsMuted">No navigation items for this role.</span>`;
    return;
  }

  root.innerHTML = visibleSections.map((section) => `
    <section style="min-width:210px;flex:1 1 210px;background:var(--surface-2,#FCFAFF);border:1px solid var(--border,#E9E4F5);border-radius:16px;padding:12px;">
      <h4 style="margin:0 0 8px 0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#6E6885);font-weight:800;">${section.title}</h4>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${section.items.map((item) => `
          <a
            href="${item.href}"
            ${item.logout ? 'data-logout-link="1"' : ""}
            class="px-3 py-2 rounded-xl text-sm font-semibold hover:opacity-90"
            style="background:var(--surface,#fff);border:1px solid var(--border,#E9E4F5);color:var(--text,#171327);text-decoration:none;"
          >${item.label}</a>
        `).join("")}
      </div>
    </section>
  `).join("");

  root.querySelectorAll("[data-logout-link='1']").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      const mod = await import("./logout.js");
      await mod.logout();
    });
  });
}
