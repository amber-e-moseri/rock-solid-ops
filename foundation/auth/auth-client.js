import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
};

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
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

