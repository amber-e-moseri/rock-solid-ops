import { supabase, getCurrentProfile } from "../auth/auth-client.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SCOPE_CHOICES = [
  { key: "INDIVIDUAL", label: "Individual person" },
  { key: "ALL_TEACHERS", label: "All Teachers" },
  { key: "SUBGROUP", label: "Subgroup" },
  { key: "GROUP", label: "Group" },
  { key: "ALL_ADMINS", label: "All Admins" },
  { key: "REGIONAL", label: "Regional (all Canada)" },
];

const state = {
  profile: null,
  conversations: [],
  selectedConversationId: "",
  recipientOptions: [],
  recipientMap: new Map(),
  selectedRecipients: new Map(),
  selectedScope: "INDIVIDUAL",
  selectedGroupId: "",
  selectedSubgroupId: "",
};

async function api(action, params = {}) {
  const { data, error } = await supabase.functions.invoke("messaging-api", { body: { action, params } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Messaging request failed");
  return data.data;
}

function fmtDate(v) {
  if (!v) return "-";
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

function roleBadge(role) {
  return `<span class="scope-badge">${esc(String(role || "").replaceAll("_", " "))}</span>`;
}

function showStatus(msg, kind = "") {
  const el = $("msgStatus");
  if (!el) return;
  el.className = `msg ${kind}`.trim();
  el.textContent = msg || "";
}

function showComposeStatus(msg, kind = "") {
  const el = $("composeStatus");
  if (!el) return;
  el.className = `msg ${kind}`.trim();
  el.textContent = msg || "";
}

function scopeLabel(c) {
  const pCount = Number(c.participant_count || 0);
  const r = Array.isArray(c.participant_roles) ? c.participant_roles : [];
  if (pCount === 2) return "Direct";
  if (String(c.scope_level || "") === "CANADA") {
    if (r.length === 1 && r[0] === "teacher") return "All Teachers";
    if (r.length && r.every((x) => ["admin", "superadmin", "regional_secretary", "principal", "subgroup_admin", "pastor"].includes(String(x)))) return "All Admins";
    return "Regional";
  }
  if (String(c.scope_level || "") === "GROUP") return c.scope_group_id || "Group";
  if (String(c.scope_level || "") === "SUBGROUP") {
    if (c.scope_group_id && c.scope_subgroup_id) return `${c.scope_group_id} · ${c.scope_subgroup_id}`;
    return c.scope_subgroup_id || "Subgroup";
  }
  return "Direct";
}

function renderConversations() {
  const wrap = $("conversationList");
  if (!wrap) return;
  if (!state.conversations.length) {
    wrap.innerHTML = `<div class="empty">No conversations yet.</div>`;
    return;
  }

  wrap.innerHTML = state.conversations.map((c) => {
    const active = String(c.id) === String(state.selectedConversationId);
    const latest = c.latest_message?.body ? esc(c.latest_message.body).slice(0, 90) : "No messages yet";
    const badge = Number(c.unread_count || 0) > 0 ? `<span class="badge">${Number(c.unread_count)}</span>` : "";
    return `<button class="conv ${active ? "active" : ""}" data-conv="${esc(c.id)}" type="button">
      <div class="conv-top"><strong>${esc(c.subject || "Conversation")}</strong>${badge}</div>
      <div class="conv-meta"><span class="scope-badge">${esc(scopeLabel(c))}</span> • ${esc(fmtDate(c.updated_at || c.created_at))}</div>
      <div class="conv-body">${latest}</div>
    </button>`;
  }).join("");

  wrap.querySelectorAll("[data-conv]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.selectedConversationId = btn.getAttribute("data-conv") || "";
      renderConversations();
      await loadMessages();
    });
  });
}

async function loadConversations() {
  const rows = await api("listConversations");
  state.conversations = Array.isArray(rows) ? rows : [];
  if (!state.selectedConversationId && state.conversations.length) {
    state.selectedConversationId = String(state.conversations[0].id || "");
  }
  renderConversations();
}

async function loadMessages() {
  const body = $("messagesBody");
  if (!body) return;
  if (!state.selectedConversationId) {
    body.innerHTML = `<div class="empty">Select or start a conversation.</div>`;
    return;
  }

  const data = await api("listMessages", { conversationId: state.selectedConversationId, limit: 100 });
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  body.innerHTML = messages.length
    ? messages.map((m) => `<article class="bubble ${String(m.sender_user_id) === String(state.profile?.user_id) ? "mine" : ""}">
      <div class="meta"><strong>${esc(m.sender_name || m.sender_role || "Staff")}</strong> • ${esc(fmtDate(m.created_at))}</div>
      <div class="text">${esc(m.body || "")}</div>
    </article>`).join("")
    : `<div class="empty">No messages in this conversation yet.</div>`;

  await api("markRead", { conversationId: state.selectedConversationId }).catch(() => {});
  body.scrollTop = body.scrollHeight;
}

function openComposeModal() {
  $("composeModal")?.classList.add("open");
  $("composeModal")?.setAttribute("aria-hidden", "false");
}

function closeComposeModal() {
  $("composeModal")?.classList.remove("open");
  $("composeModal")?.setAttribute("aria-hidden", "true");
}

function normalizeOptions(rows) {
  state.recipientOptions = Array.isArray(rows) ? rows : [];
  state.recipientMap = new Map(state.recipientOptions.map((r) => [String(r.user_id), r]));
}

function filterOptionsByRole(scopeKey) {
  const all = state.recipientOptions;
  if (scopeKey === "ALL_TEACHERS") return all.filter((r) => String(r.role) === "teacher");
  if (scopeKey === "ALL_ADMINS") return all.filter((r) => ["admin", "superadmin", "regional_secretary", "principal", "subgroup_admin", "pastor"].includes(String(r.role)));
  if (scopeKey === "GROUP") return all.filter((r) => !state.selectedGroupId || String(r.group_id || "") === state.selectedGroupId);
  if (scopeKey === "SUBGROUP") return all.filter((r) => !state.selectedSubgroupId || String(r.subgroup_id || "") === state.selectedSubgroupId);
  if (scopeKey === "REGIONAL") return all;
  return all;
}

function renderScopeOptions() {
  const wrap = $("scopeOptions");
  if (!wrap) return;
  const isTeacher = String(state.profile?.role || "") === "teacher";
  const choices = isTeacher
    ? [{ key: "MESSAGE_ADMIN", label: "Message Admin" }, { key: "INDIVIDUAL", label: "Search other teachers" }]
    : SCOPE_CHOICES;

  wrap.innerHTML = choices.map((c) => {
    const checked = c.key === state.selectedScope ? "checked" : "";
    return `<label style="display:flex;align-items:center;gap:8px;border:1px solid var(--color-border);border-radius:10px;padding:8px;">
      <input type="radio" name="scopeType" value="${esc(c.key)}" ${checked} />
      <span>${esc(c.label)}</span>
    </label>`;
  }).join("");

  wrap.querySelectorAll("input[name='scopeType']").forEach((el) => {
    el.addEventListener("change", () => {
      state.selectedScope = el.value;
      if (state.selectedScope !== "GROUP") state.selectedGroupId = "";
      if (state.selectedScope !== "SUBGROUP") state.selectedSubgroupId = "";
      if (state.selectedScope !== "INDIVIDUAL") {
        state.selectedRecipients.clear();
      }
      renderScopeExtras();
      renderSelectedRecipients();
      runSearch();
      if (state.selectedScope === "MESSAGE_ADMIN") {
        const admin = state.recipientOptions.find((r) => ["admin", "superadmin", "regional_secretary", "principal", "subgroup_admin", "pastor"].includes(String(r.role)));
        if (admin) state.selectedRecipients.set(String(admin.user_id), admin);
        renderSelectedRecipients();
      }
    });
  });
}

function renderScopeExtras() {
  const wrap = $("scopeExtras");
  if (!wrap) return;
  const subgroupOptions = ["CESGA", "CESGB", "CSGA", "CSGB", "WSGA", "WSGB"];
  const groupOptions = ["CE", "CS", "WS"];
  if (state.selectedScope === "SUBGROUP") {
    wrap.innerHTML = `<select id="scopeSubgroupSelect" class="fs-input"><option value="">Select subgroup</option>${subgroupOptions.map((v) => `<option value="${v}" ${state.selectedSubgroupId === v ? "selected" : ""}>${v}</option>`).join("")}</select>`;
    $("scopeSubgroupSelect")?.addEventListener("change", (e) => {
      state.selectedSubgroupId = String(e.target.value || "");
      runSearch();
    });
    return;
  }
  if (state.selectedScope === "GROUP") {
    wrap.innerHTML = `<select id="scopeGroupSelect" class="fs-input"><option value="">Select group</option>${groupOptions.map((v) => `<option value="${v}" ${state.selectedGroupId === v ? "selected" : ""}>${v}</option>`).join("")}</select>`;
    $("scopeGroupSelect")?.addEventListener("change", (e) => {
      state.selectedGroupId = String(e.target.value || "");
      runSearch();
    });
    return;
  }
  wrap.innerHTML = "";
}

function renderSelectedRecipients() {
  const wrap = $("selectedRecipients");
  if (!wrap) return;
  const selected = [...state.selectedRecipients.values()];
  if (!selected.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = selected.map((r) => `<span class="chip">${esc(r.full_name || r.email || "Recipient")}<button type="button" data-remove-recipient="${esc(r.user_id)}">×</button></span>`).join("");
  wrap.querySelectorAll("[data-remove-recipient]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedRecipients.delete(btn.getAttribute("data-remove-recipient") || "");
      renderSelectedRecipients();
    });
  });
}

async function runSearch() {
  const isTeacher = String(state.profile?.role || "") === "teacher";
  const searchWrap = $("recipientSearchResults");
  const step = $("searchStep");
  if (!searchWrap || !step) return;

  const isSearchMode = ["INDIVIDUAL", "MESSAGE_ADMIN"].includes(state.selectedScope);
  step.style.display = isSearchMode ? "block" : "none";
  if (!isSearchMode) {
    searchWrap.innerHTML = "";
    return;
  }

  const q = String($("recipientSearchInput")?.value || "").trim();
  if (!q && state.selectedScope === "INDIVIDUAL") {
    searchWrap.innerHTML = `<div class="empty">Type to search recipients.</div>`;
    return;
  }

  let rows = [];
  if (q) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, email, full_name, role")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    rows = Array.isArray(data) ? data : [];
  } else {
    rows = filterOptionsByRole("INDIVIDUAL").slice(0, 10);
  }

  const scoped = rows
    .map((r) => state.recipientMap.get(String(r.user_id)) || r)
    .filter((r) => {
      if (String(r.user_id) === String(state.profile?.user_id)) return false;
      if (isTeacher) return ["teacher", "admin", "superadmin", "regional_secretary", "principal", "subgroup_admin", "pastor"].includes(String(r.role));
      if (state.selectedScope === "MESSAGE_ADMIN") return ["admin", "superadmin", "regional_secretary", "principal", "subgroup_admin", "pastor"].includes(String(r.role));
      return true;
    });

  searchWrap.innerHTML = scoped.length
    ? scoped.map((r) => `<button class="search-row" type="button" data-pick-recipient="${esc(r.user_id)}"><span><strong>${esc(r.full_name || "-")}</strong><br/><small>${esc(r.email || "")}</small></span>${roleBadge(r.role)}</button>`).join("")
    : `<div class="empty">No matching recipients.</div>`;

  searchWrap.querySelectorAll("[data-pick-recipient]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-pick-recipient") || "";
      const row = state.recipientMap.get(id) || scoped.find((x) => String(x.user_id) === id);
      if (!row) return;
      state.selectedRecipients.set(id, row);
      renderSelectedRecipients();
    });
  });
}

async function sendMessage() {
  const bodyEl = $("messageInput");
  const body = String(bodyEl?.value || "").trim();
  if (!body) return;

  const payload = { body };
  if (state.selectedConversationId) payload.conversationId = state.selectedConversationId;

  await api("sendMessage", payload);
  if (bodyEl) bodyEl.value = "";
  await loadConversations();
  await loadMessages();
}

async function sendFromModal() {
  const body = String($("modalMessageInput")?.value || "").trim();
  const subject = String($("modalSubjectInput")?.value || "").trim() || "New Conversation";
  if (!body) throw new Error("Message is required");

  let recipientUserIds = [...state.selectedRecipients.keys()];
  if (!recipientUserIds.length) {
    const pickFromScope = filterOptionsByRole(state.selectedScope)
      .filter((r) => String(r.user_id) !== String(state.profile?.user_id));
    recipientUserIds = pickFromScope.map((r) => String(r.user_id));
  }
  if (!recipientUserIds.length) throw new Error("Pick at least one recipient");

  const payload = { subject, body, recipientUserIds };
  if (state.selectedScope === "SUBGROUP") {
    payload.scopeLevel = "SUBGROUP";
    payload.scopeSubgroupId = state.selectedSubgroupId || null;
  } else if (state.selectedScope === "GROUP") {
    payload.scopeLevel = "GROUP";
    payload.scopeGroupId = state.selectedGroupId || null;
  } else if (["ALL_TEACHERS", "ALL_ADMINS", "REGIONAL"].includes(state.selectedScope)) {
    payload.scopeLevel = "CANADA";
  } else {
    payload.scopeLevel = "SUBGROUP";
  }

  await api("sendMessage", payload);
  $("modalMessageInput").value = "";
  $("modalSubjectInput").value = "";
  state.selectedRecipients.clear();
  closeComposeModal();
  await loadConversations();
  state.selectedConversationId = String(state.conversations[0]?.id || "");
  await loadMessages();
}

async function loadRecipientOptions() {
  const data = await api("getRecipientOptions", {});
  normalizeOptions(data?.recipients || []);
}

async function boot() {
  state.profile = await getCurrentProfile();
  await loadRecipientOptions();

  renderScopeOptions();
  renderScopeExtras();
  renderSelectedRecipients();

  $("composeBtn")?.addEventListener("click", () => {
    showComposeStatus("");
    openComposeModal();
    runSearch().catch(() => {});
  });
  $("composeCloseBtn")?.addEventListener("click", closeComposeModal);
  $("recipientSearchInput")?.addEventListener("input", () => { runSearch().catch(() => {}); });
  $("modalSendBtn")?.addEventListener("click", async () => {
    try {
      showComposeStatus("");
      await sendFromModal();
    } catch (err) {
      showComposeStatus(`Send failed: ${String(err?.message || err)}`, "error");
    }
  });

  $("sendBtn")?.addEventListener("click", async () => {
    try {
      showStatus("");
      await sendMessage();
    } catch (err) {
      showStatus(`Send failed: ${String(err?.message || err)}`, "error");
    }
  });

  await loadConversations();
  await loadMessages();
}

boot().catch((err) => {
  showStatus(`Messaging failed to load: ${String(err?.message || err)}`, "error");
});
