# Foundation School Runtime Security Config

## Why this change
- Supabase is now canonical backend.
- Hardcoded project URL/anon keys in committed source create unnecessary key exposure and credential rotation risk.
- The anon key is public-ish but still should be managed as environment-driven runtime config, not scattered in source files.

## Canonical runtime pattern
- Client pages read from:

```js
window.FS_CONFIG = {
  SUPABASE_URL: "https://<project-ref>.supabase.co",
  SUPABASE_ANON_KEY: "<anon-key>"
};
```

- `foundation/js/config.js` is runtime-provided and gitignored.
- `foundation/js/config.js.example` is the committed template.
- `foundation/auth/auth-client.js` reads only `window.FS_CONFIG`.

## Source of truth rules
- Do not hardcode Supabase URL/key in HTML, JS, or inline scripts.
- Do not use meta tags for Supabase credentials.
- Do not commit real `.env` values.
- Keep RLS enabled and strict; anon key does not replace access control.

## Local dev setup
1. Copy `foundation/js/config.js.example` to `foundation/js/config.js`.
2. Set local values for `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Run app normally.

## Deployment config injection (static hosting safe)
- Generate `foundation/js/config.js` at deploy time from environment variables.

Example CI step:

```bash
cat > foundation/js/config.js <<'EOF'
window.FS_CONFIG = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
};
EOF
```

- Use platform secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) in Netlify/Vercel/GitHub Actions.
- Never store real values in repository files.

## Files that must never be committed
- `foundation/js/config.js`
- `.env`
- `.env.local`
- `.env.*.local`
- Any generated runtime config artifacts.

## Forbidden patterns
- `const SUPABASE_URL = 'https://...supabase.co'` in committed source.
- `const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlbHBzdHRxaHJjcW10dG1qb3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4ODcxMTMsImV4cCI6MjA5MzQ2MzExM30.7a5yGvkaxxUBMOZl-_nZjjDCVYYvf4FrmwwhrzYd9zQ'` in committed source.
- `meta name="supabase-url"` / `meta name="supabase-anon-key"` credential injection.

