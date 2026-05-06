import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function readRuntimeConfig() {
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

const missing = [];
if (!CONFIG.SUPABASE_URL) missing.push("SUPABASE_URL");
if (!CONFIG.SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
if (missing.length) reportMissingConfig(missing);

export const supabase = createClient(
  CONFIG.SUPABASE_URL || "https://invalid.localhost",
  CONFIG.SUPABASE_ANON_KEY || "invalid-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export async function getSessionOrNull() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function getCurrentProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id,email,full_name,role,is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

