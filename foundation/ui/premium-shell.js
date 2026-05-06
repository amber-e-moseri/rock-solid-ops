(function(){
  const key = "fs_theme";

  function getPreferredTheme(){
    const saved = localStorage.getItem(key);
    if(saved === "light" || saved === "dark") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(key, theme);
    const btn = document.getElementById("codex-theme-toggle");
    if(btn) btn.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }

  function ensureToggle(){
    if(document.getElementById("codex-theme-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "codex-theme-toggle";
    btn.type = "button";
    btn.textContent = "Dark Mode";
    btn.addEventListener("click", function(){
      const current = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
    document.body.appendChild(btn);
  }

  function boot(){
    applyTheme(getPreferredTheme());
    ensureToggle();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
