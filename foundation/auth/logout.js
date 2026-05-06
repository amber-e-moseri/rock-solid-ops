import { supabase } from "./auth-client.js";

export async function logout() {
  await supabase.auth.signOut();
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/staff/login.html?next=${next}`;
}
