import { supabase } from "./auth-client.js";

function resolveAppPath(relativePath) {
  const clean = String(relativePath || "").replace(/^\/+/, "");
  const p = window.location.pathname || "";
  if (p.includes("/foundation/")) return `/foundation/${clean}`;
  return `/${clean}`;
}

export async function logout() {
  await supabase.auth.signOut();
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `${resolveAppPath("auth/login.html")}?next=${next}`;
}
