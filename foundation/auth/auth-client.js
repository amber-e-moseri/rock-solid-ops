import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Consumers: foundation/index.html, foundation/auth/{login.html,logout.js,role-sidebar.js}, foundation/js/{admin-review.js,admin-shell.js,applicant-directory.js,failed-sync-retry-center.js,notification-center.js,operational-trace.js,teacher-shell.js,teacher-management.js}, foundation/staff/*, foundation/teacher/*.

function readRuntimeConfig() {
  if (window.FSConfig?.ensureOrRender) {
    const result = window.FSConfig.ensureOrRender({ render: true });
    return result.config;
  }
  const cfg = window.FS_CONFIG || {};
  return {
    SUPABASE_URL: String(cfg.SUPABASE_URL || "").trim(),
    SUPABASE_ANON_KEY: String(cfg.SUPABASE_ANON_KEY || "").trim(),
  };
}

function reportMissingConfig(keys) {
  const message = `Missing runtime config: ${keys.join(", ")}. Create foundation/js/config.js from config.js.example.`;
  console.error("[FS_CONFIG_ERROR]", message, { missing: keys });
  const host = document.getElementById("configError") || document.body;
  if (host) {
    const el = document.createElement("div");
    el.setAttribute("role", "alert");
    el.style.cssText =
      "margin:16px;padding:12px 14px;border-radius:10px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;font:600 13px/1.45 Manrope,system-ui;";
    el.textContent =
      "Configuration is missing. Please contact support or set runtime config before using this page.";
    host.prepend(el);
  }
}

export const CONFIG = readRuntimeConfig();
const BYPASS_ROLE = (
  window.FS_CONFIG?.BYPASS_ROLE &&
  (window.location.hostname === "localhost" || window.location.hostname.includes("127.0.0.1") || window.FS_CONFIG?.ENV === "dev")
) ? String(window.FS_CONFIG.BYPASS_ROLE).trim().toLowerCase() : "";
if (BYPASS_ROLE) {
  console.warn("[auth-client] BYPASS_ROLE active — all role checks bypassed. Dev only.");
}

const missing = [];
if (!CONFIG.SUPABASE_URL) missing.push("SUPABASE_URL");
if (!CONFIG.SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
if (missing.length) reportMissingConfig(missing);

if (window.FSConfig?.validate) {
  const validity = window.FSConfig.validate(CONFIG);
  if (validity.warnings?.length) {
    console.warn("[FS_CONFIG_WARN]", validity.warnings.join(" "));
  }
}

export const supabase = createClient(
  CONFIG.SUPABASE_URL || "https://invalid.example.com",
  CONFIG.SUPABASE_ANON_KEY || "invalid-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

// Canonical teacher landing URL (relative to /foundation).
export const TEACHER_LANDING_PATH = "teacher/index.html";

export async function getSessionOrNull() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

function warnAuthResolution(stage, error, extra) {
  const payload = {
    code: error?.code || null,
    message: error?.message || String(error || ""),
    details: error?.details || null,
    hint: error?.hint || null,
    ...(extra || {}),
  };
  console.warn(`[auth-client] ${stage}`, payload);
}

function isMissingTableError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

function isAuthError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || error?.status || "");
  return (
    code === "401" ||
    code === "PGRST301" ||
    msg.includes("jwt") ||
    msg.includes("not authenticated") ||
    msg.includes("token is expired") ||
    msg.includes("invalid session")
  );
}

function normalizeRole(rawRole, fallbackRole = "user") {
  const role = String(rawRole || "").trim();
  if (!role) return fallbackRole;
  return role.toLowerCase();
}

function resolveActiveState(row, fallback = true) {
  const status = String(row?.status || "").trim().toLowerCase();
  if (row?.is_active === false) return false;
  if (row?.active === false) return false;
  if (status === "suspended" || status === "inactive" || status === "disabled") return false;
  if (row?.is_active === true || row?.active === true) return true;
  return fallback;
}

function normalizeProfileRecord(source, row, user, opts = {}) {
  const role =
    normalizeRole(
      row?.role || user?.user_metadata?.role || user?.app_metadata?.role,
      opts.defaultRole || "user",
    );
  return {
    user_id: row?.id || row?.auth_user_id || user?.id || null,
    email: row?.email || user?.email || null,
    full_name:
      row?.full_name ||
      row?.name ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      "User",
    role,
    is_active: resolveActiveState(row, opts.defaultActive !== false),
    source,
  };
}

const ROLES = Object.freeze({
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  SUBGROUP_ADMIN: "subgroup_admin",
  PASTOR: "pastor",
  PRINCIPAL: "principal",
  TEACHER: "teacher",
  PENDING: "pending",
});

const ADMIN_ROLES = new Set([
  ROLES.SUPERADMIN,
  ROLES.ADMIN,
  ROLES.SUBGROUP_ADMIN,
  ROLES.PASTOR,
  ROLES.PRINCIPAL,
]);

const STAFF_ROLES = new Set([
  ...ADMIN_ROLES,
  ROLES.TEACHER,
]);

const DASHBOARD_ROLES = new Set([
  ...STAFF_ROLES,
]);

export function canonicalRole(rawRole) {
  if (BYPASS_ROLE) return BYPASS_ROLE;
  return normalizeRole(rawRole, "user");
}

export function isSuperadmin(role) {
  return canonicalRole(role) === ROLES.SUPERADMIN;
}

export function isAdmin(role) {
  return ADMIN_ROLES.has(canonicalRole(role));
}

export function isStaff(role) {
  return STAFF_ROLES.has(canonicalRole(role));
}

export function isTeacher(role) {
  return canonicalRole(role) === ROLES.TEACHER;
}

export function isPending(role) {
  return canonicalRole(role) === ROLES.PENDING;
}

export function canManageSubgroup(role) {
  return ADMIN_ROLES.has(canonicalRole(role));
}

export function canManageTeacher(role) {
  return ADMIN_ROLES.has(canonicalRole(role));
}

export function canViewDashboard(role) {
  return DASHBOARD_ROLES.has(canonicalRole(role));
}

export function isRoleAllowed(role, allowedRoles) {
  if (!allowedRoles) return false;
  const normalized = canonicalRole(role);
  const allowed = allowedRoles instanceof Set ? allowedRoles : new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
  return allowed.has(normalized);
}

async function selectFirstWorkingMaybeSingle({ table, matchers, projections, stage }) {
  let lastError = null;
  for (const projection of projections) {
    let query = supabase.from(table).select(projection);
    for (const matcher of matchers) {
      if (matcher.type === "eq") query = query.eq(matcher.column, matcher.value);
      if (matcher.type === "or") query = query.or(matcher.value);
    }
    const { data, error } = await query.maybeSingle();
    if (!error) return { data, projection };
    lastError = error;
    warnAuthResolution(`${stage} projection failed`, error, { table, projection });
    if (isAuthError(error)) throw error;
  }
  return { data: null, error: lastError };
}

/**
 * Returns the canonical profile for the current user.
 *
 * Resolution order:
 *   1. profiles table (canonical)  - keyed by id = auth user UUID
 *   2. admin_users table (legacy)  - keyed by auth_user_id or email
 *   3. Auth user metadata fallback - role: "user", active: true
 *
 * Throws only on auth errors (JWT expired / no session).
 * Returns null if no user is signed in.
 */
export async function getCurrentProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const user = userData?.user;
  if (!user) return null;

  const profilesResult = await selectFirstWorkingMaybeSingle({
    table: "profiles",
    stage: "profiles lookup",
    matchers: [{ type: "eq", column: "user_id", value: user.id }],
    projections: [
      "user_id,email,full_name,role,is_active",
      "user_id,email,full_name,role",
      "user_id,email,role",
      "user_id,role",
    ],
  });

  if (profilesResult.data) {
    return normalizeProfileRecord("profiles", profilesResult.data, user, {
      defaultRole: "user",
      defaultActive: true,
    });
  }
  if (profilesResult.error && !isMissingTableError(profilesResult.error)) {
    warnAuthResolution("profiles lookup exhausted projections", profilesResult.error, { user_id: user.id });
  }

  const email = String(user.email || "").trim();
  const adminResult = await selectFirstWorkingMaybeSingle({
    table: "admin_users",
    stage: "admin_users lookup",
    matchers: [{ type: "or", value: `auth_user_id.eq.${user.id},email.eq.${email}` }],
    projections: [
      "auth_user_id,email,full_name,name,role,is_active,active,status",
      "auth_user_id,email,full_name,name,role,active,status",
      "auth_user_id,email,full_name,name,role,status",
      "auth_user_id,email,full_name,name,role,active",
      "auth_user_id,email,full_name,name,role",
      "auth_user_id,email,role",
      "auth_user_id,role",
    ],
  });

  if (adminResult.data) {
    return normalizeProfileRecord("admin_users", adminResult.data, user, {
      defaultRole: "admin",
      defaultActive: true,
    });
  }
  if (adminResult.error && !isMissingTableError(adminResult.error)) {
    warnAuthResolution("admin_users lookup exhausted projections", adminResult.error, { user_id: user.id });
  }

  const metadataProfile = normalizeProfileRecord("auth", {}, user, {
    defaultRole: "user",
    defaultActive: true,
  });
  console.warn("[auth-client] falling back to auth metadata profile", {
    user_id: metadataProfile.user_id,
    email: metadataProfile.email,
    role: metadataProfile.role,
  });
  return metadataProfile;
}

/**
 * Checks the current session and redirects to login if missing.
 * Returns the session object or null (after redirect has been initiated).
 */
export async function requireSession(redirectUrl = "login.html") {
  const p = window.location.pathname || "";
  const defaultLogin = p.includes("/foundation/") ? "/foundation/auth/login.html" : "/auth/login.html";
  const target = redirectUrl === "login.html" ? defaultLogin : redirectUrl;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) {
      window.location.href = target;
      return null;
    }
    return data.session;
  } catch (err) {
    console.error("[auth-client] requireAuth error:", err);
    window.location.href = target;
    return null;
  }
}

/**
 * Checks profile role against an allowed set.
 * opts: { redirectUrl, containerEl, message }
 * Returns true if allowed, false otherwise (and renders unauthorized state).
 */
export function requireRole(profile, allowed, opts = {}) {
  const roles =
    allowed instanceof Set
      ? allowed
      : new Set(Array.isArray(allowed) ? allowed : [allowed]);

  if (!profile || !roles.has(String(profile.role || ""))) {
    if (opts.containerEl) {
      opts.containerEl.innerHTML = _unauthorizedHtml(opts.message);
    } else if (opts.redirectUrl) {
      window.location.href = opts.redirectUrl;
    }
    return false;
  }
  return true;
}

function _unauthorizedHtml(msg) {
  const p = window.location.pathname || "";
  const loginHref = p.includes("/foundation/") ? "/foundation/auth/login.html" : "/auth/login.html";
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;min-height:280px;gap:16px;padding:48px 24px;text-align:center;">' +
    '<div style="font-size:40px;">??</div>' +
    '<h2 style="margin:0;font-size:20px;font-weight:800;">Access Denied</h2>' +
    '<p style="margin:0;color:#6f6881;max-width:320px;line-height:1.6;">' +
    (msg || "Your account does not have permission to view this page.") +
    '</p>' +
    '<a href="' + loginHref + '" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;' +
    'border-radius:12px;background:#5b3fa5;color:#fff;font-weight:700;' +
    'font-size:14px;text-decoration:none;">Sign in with a different account</a>' +
    '</div>'
  );
}

function resolveAppPath(relativePath) {
  const clean = String(relativePath || "").replace(/^\/+/, "");
  const p = window.location.pathname || "";
  if (p.includes("/foundation/")) return `/foundation/${clean}`;
  return `/${clean}`;
}

function redirectToLogin() {
  redirectToLoginWithError("");
}

function redirectToLoginWithError(errorCode) {
  const current = window.location.pathname || "";
  const next = encodeURIComponent(current + window.location.search);
  const err = String(errorCode || "").trim();
  const errParam = err ? `&error=${encodeURIComponent(err)}` : "";
  window.location.href = `${resolveAppPath("auth/login.html")}?next=${next}${errParam}`;
}

export async function requireAuth(allowedRoles = []) {
  const session = await getSessionOrNull();
  if (!session) {
    redirectToLogin();
    return null;
  }

  const profile = await getCurrentProfile();
  if (!profile || profile.is_active === false) {
    redirectToLoginWithError("inactive");
    return null;
  }
  if (isPending(profile.role)) {
    redirectToLoginWithError("pending");
    return null;
  }

  if (isTeacher(profile.role)) {
    const authEmail = String(session.user?.email || "").trim().toLowerCase();
    const { data: teacherRow, error: teacherErr } = await supabase
      .from("teachers")
      .select("teacher_id,email,status,active,deleted_at")
      .ilike("email", authEmail)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const status = String(teacherRow?.status || "").trim().toUpperCase();
    const isActive = teacherRow?.active !== false;
    if (teacherErr || !teacherRow || status !== "ACTIVE" || !isActive) {
      redirectToLoginWithError("inactive");
      return null;
    }
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !isRoleAllowed(profile.role, allowedRoles)) {
    redirectToLoginWithError("unauthorized");
    return null;
  }

  return { session, profile };
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    redirectToLogin();
  }
});
