(function () {
  const KEY = "fs_theme";
  const Shell = (window.FSTeacherShell = window.FSTeacherShell || {});
  let accessCheckPromise = null;
  let shellMounted = false;
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
    if (p.includes("index")) return "my-class";
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

  async function resolveTeacherIdentity() {
    try {
      const auth = await import("../auth/auth-client.js");
      const session = await auth.getSessionOrNull();
      const profile = await auth.getCurrentProfile();
      const email = String(profile?.email || session?.user?.email || "").trim();
      const uid = String(profile?.user_id || session?.user?.id || "").trim();

      let teacherName = "";
      if (uid || email) {
        let q = auth.supabase
          .from("teachers")
          .select("full_name,email,deleted_at")
          .is("deleted_at", null)
          .limit(1);
        if (uid) q = q.eq("teacher_user_id", uid);
        else q = q.eq("email", email);
        const { data } = await q.maybeSingle();
        teacherName = String(data?.full_name || "").trim();
      }

      const profileName = String(profile?.full_name || "").trim();
      const metaName = String(session?.user?.user_metadata?.full_name || "").trim();
      const fullName = teacherName || profileName || metaName || email || "Teacher";
      return { fullName, email, supabase: auth.supabase };
    } catch (_) {
      return { fullName: "Teacher", email: "", supabase: null };
    }
  }

  async function enforceTeacherAccess() {
    if (accessCheckPromise) return accessCheckPromise;
    accessCheckPromise = (async () => {
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

      const uid = String(session.user?.id || "").trim();
      const email = String(session.user?.email || "").trim();
      if (!uid && !email) {
        window.location.href = resolveLoginPath();
        return false;
      }

      let data = null;
      let error = null;
      if (uid) {
        const byUserId = await auth.supabase
          .from("teachers")
          .select("teacher_id,status,active,deleted_at")
          .eq("teacher_user_id", uid)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        data = byUserId.data;
        error = byUserId.error;
      }
      if (!data && email) {
        const byEmail = await auth.supabase
          .from("teachers")
          .select("teacher_id,status,active,deleted_at")
          .eq("email", email)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        data = byEmail.data;
        error = byEmail.error;
      }
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
    } finally {
      accessCheckPromise = null;
    }
    })();
    return accessCheckPromise;
  }

  Shell.mount = function mount(opts) {
    if (window !== window.top) return;
    opts = opts || {};
    document.body.classList.add("fs-force-light");
    const active = opts.active || inferActiveKey();
    const links = [
      { href: "../teacher/index.html?section=dashboard", icon: "", label: "Dashboard", key: "dashboard" },
      { href: "../teacher/index.html?section=attendance", icon: "", label: "Attendance", key: "attendance" },
      { href: "../teacher/index.html?section=my-class", icon: "", label: "My Class", key: "my-class" },
      { href: "../teacher/index.html?section=availability", icon: "", label: "Availability", key: "availability" },
    ];

    // Remove any accidental duplicate shells from previous buggy mounts.
    const existing = document.querySelectorAll(".fs-shell-nav");
    if (existing.length > 1) {
      for (let i = 1; i < existing.length; i += 1) existing[i].remove();
    }
    if (!document.querySelector(".fs-shell-nav")) {
      ensureManrope();
      const nav = document.createElement("nav");
      nav.className = "fs-shell-nav";
      nav.innerHTML = `
        <div class="fs-shell-inner">
          <div class="fs-shell-brand" style="display:flex;align-items:center;gap:8px;">
            <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="Rock Solid" style="width:28px;height:28px;border-radius:8px;" />
            <span>Rock Solid</span>
          </div>
          <div class="fs-shell-links">
            ${links
              .map(
                (l) =>
                  `<a class="fs-shell-link ${l.key === active ? "active" : ""}" href="${l.href}">
                     <span>${l.label}</span>
                   </a>`
              )
              .join("")}
          </div>
          <div class="fs-shell-footer" style="margin-top:auto;padding-top:10px;padding-bottom:16px;border-top:1px solid color-mix(in srgb, var(--border) 70%, transparent);">
            <div id="fsShellTeacherName" style="font-weight:700;font-size:14px;line-height:1.25;color:#fff;">Teacher</div>
            <div id="fsShellTeacherEmail" style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;word-break:break-word;">&nbsp;</div>
            <div style="margin-top:8px;"><span class="fs-badge fs-badge-primary">Teacher</span></div>
            <button id="fsShellSignOutBtn" type="button" class="fs-btn fs-btn-secondary" style="width:100%;margin-top:10px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#fff;">Sign Out</button>
          </div>
          <button id="fs-theme-toggle" class="fs-shell-theme-btn" aria-label="Toggle theme" style="display:none">T</button>
        </div>
      `;
      document.body.prepend(nav);
    }

    const themeBtn = document.getElementById("fs-theme-toggle");
    if (themeBtn) themeBtn.style.display = "none";

    initTheme();
    resolveTeacherIdentity().then(({ fullName, email, supabase }) => {
      const nameEl = document.getElementById("fsShellTeacherName");
      const emailEl = document.getElementById("fsShellTeacherEmail");
      const signOutBtn = document.getElementById("fsShellSignOutBtn");
      if (nameEl) nameEl.textContent = fullName || "Teacher";
      if (emailEl) emailEl.textContent = email || "";
      if (signOutBtn) {
        signOutBtn.addEventListener("mouseenter", () => { signOutBtn.style.background = "rgba(255,255,255,0.1)"; });
        signOutBtn.addEventListener("mouseleave", () => { signOutBtn.style.background = "transparent"; });
        signOutBtn.addEventListener("click", async () => {
          try {
            await supabase?.auth?.signOut();
          } catch (_) {}
          window.location.href = "/foundation/auth/login.html";
        });
      }
    });
    if (opts.enforceAccess !== false) {
      enforceTeacherAccess();
    }
    shellMounted = true;
  };

  Shell.unmount = function unmount() {
    document.querySelectorAll(".fs-shell-nav").forEach((el) => el.remove());
    shellMounted = false;
  };
})();
