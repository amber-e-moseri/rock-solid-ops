import { supabase, getSessionOrNull, getCurrentProfile } from "./auth-client.js";

function redirectToLogin() {
  const current = window.location.pathname || "";
  const next = encodeURIComponent(current + window.location.search);
  window.location.href = `/staff/login.html?next=${next}`;
}

export async function requireAuth(allowedRoles = []) {
  const session = await getSessionOrNull();
  if (!session) {
    redirectToLogin();
    return null;
  }

  const profile = await getCurrentProfile();
  if (!profile || profile.is_active === false) {
    document.body.innerHTML = "<h2>Access denied: inactive or missing profile.</h2>";
    return null;
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(profile.role)
  ) {
    document.body.innerHTML = `<h2>Access denied for role: ${profile.role}</h2>`;
    return null;
  }

  return { session, profile };
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    redirectToLogin();
  }
});
