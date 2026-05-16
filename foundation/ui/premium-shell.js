(function(){
  const key = "fs_theme";

  function applyTheme(){
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
    localStorage.setItem(key, "light");
    localStorage.setItem("fs_admin_theme", "light");
    localStorage.setItem("fs_batch_theme", "light");
    const btn = document.getElementById("codex-theme-toggle");
    if(btn) btn.style.display = "none";
  }

  function ensureToggle(){
    if(document.getElementById("codex-theme-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "codex-theme-toggle";
    btn.type = "button";
    btn.textContent = "Light Mode";
    btn.style.display = "none";
    document.body.appendChild(btn);
  }

  function boot(){
    applyTheme();
    ensureToggle();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
