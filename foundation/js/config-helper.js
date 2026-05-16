(function attachFsConfig(global) {
  function getRaw() {
    return global.FS_CONFIG || {};
  }

  function get() {
    const cfg = getRaw();
    return {
      SUPABASE_URL: String(cfg.SUPABASE_URL || "").trim(),
      SUPABASE_ANON_KEY: String(cfg.SUPABASE_ANON_KEY || "").trim(),
    };
  }

  function hasPlaceholder(value) {
    const v = String(value || "").trim();
    return !v || v.includes("YOUR-") || v.includes("YOUR_") || v.includes("<") || v.includes(">") || v.toLowerCase().includes("example");
  }

  function isLikelyJwt(value) {
    const v = String(value || "").trim();
    const parts = v.split(".");
    return parts.length === 3 && parts.every(Boolean);
  }

  function isLikelyAnonKey(value) {
    const v = String(value || "").trim();
    return v.startsWith("eyJ") || v.startsWith("sb_publishable_");
  }

  function isLikelySupabaseUrl(value) {
    const v = String(value || "").trim();
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(v);
  }

  function validate(config) {
    const cfg = config || get();
    const missing = [];
    const warnings = [];

    if (hasPlaceholder(cfg.SUPABASE_URL)) missing.push("SUPABASE_URL");
    if (hasPlaceholder(cfg.SUPABASE_ANON_KEY)) missing.push("SUPABASE_ANON_KEY");

    if (cfg.SUPABASE_URL && !isLikelySupabaseUrl(cfg.SUPABASE_URL)) {
      warnings.push("SUPABASE_URL format looks invalid.");
    }
    if (cfg.SUPABASE_ANON_KEY && !isLikelyAnonKey(cfg.SUPABASE_ANON_KEY)) {
      warnings.push("SUPABASE_ANON_KEY format looks invalid.");
    }

    const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(global.location.hostname || "");
    if (!isLocalHost && missing.length) {
      warnings.push("Production-like runtime without valid config detected.");
    }

    return { ok: missing.length === 0, missing, warnings, config: cfg };
  }

  function renderError(message) {
    const host = document.getElementById("configError") || document.body;
    if (!host) return;
    if (document.getElementById("fs-config-runtime-error")) return;
    const el = document.createElement("div");
    el.id = "fs-config-runtime-error";
    el.setAttribute("role", "alert");
    el.style.cssText = "margin:16px;padding:12px 14px;border-radius:10px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;font:600 13px/1.45 Manrope,system-ui;";
    el.textContent = message;
    host.prepend(el);
  }

  function ensureOrRender(options) {
    const opts = options || {};
    const v = validate();
    if (!v.ok) {
      const msg = "Configuration is missing. Create foundation/js/config.js from config.js.example before using this page.";
      console.error("[FS_CONFIG_ERROR]", msg, { missing: v.missing, warnings: v.warnings });
      if (opts.render !== false) renderError(msg);
      return v;
    }

    if (v.warnings.length) {
      console.warn("[FS_CONFIG_WARN]", v.warnings.join(" "), v.config);
    }

    return v;
  }

  global.FSConfig = {
    get,
    validate,
    ensureOrRender,
    renderError,
  };

  // Emit early warning for malformed or placeholder config in non-local environments.
  const initial = validate();
  if (!initial.ok) {
    renderError("Configuration is missing. Create foundation/js/config.js from config.js.example before using this page.");
  }
  if (initial.warnings.length) {
    console.warn("[FS_CONFIG_WARN]", initial.warnings.join(" "), initial.config);
  }
})(window);

