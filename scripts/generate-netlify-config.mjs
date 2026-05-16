import fs from "node:fs";
import path from "node:path";

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
const bypassRole = String(process.env.BYPASS_ROLE || "").trim().toLowerCase();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[build-config] Missing required Netlify env vars: SUPABASE_URL and/or SUPABASE_ANON_KEY.");
  process.exit(1);
}

const outPath = path.join(process.cwd(), "foundation", "js", "config.js");
const contents = `window.FS_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)},
  BYPASS_ROLE: ${JSON.stringify(bypassRole)},
};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, contents, "utf8");
console.log(`[build-config] Wrote ${outPath}`);
