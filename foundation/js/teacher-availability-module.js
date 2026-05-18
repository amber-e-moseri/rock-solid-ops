import {
  getCampuses,
  getTeachers,
  getScheduledClassConflicts,
  loadAvailability,
  submitAvailability,
} from "./availabilityApi.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM",
];

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function slotKey(day, time) {
  return `${day}__${time}`;
}

function monthOptions(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      month: d.toLocaleDateString("en-US", { month: "long" }),
      year: d.getFullYear(),
    };
  });
}

function toTime24(time12) {
  const m = String(time12 || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const ap = String(m[3]).toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
}

export async function mountTeacherAvailability(containerId) {
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`Container not found: ${containerId}`);

  const state = {
    campuses: [],
    teachers: [],
    selectedCampusCodes: new Set(),
    activeCampusCode: "",
    selectionsByCampus: {},
    blockedSlots: new Set(),
    blockedMeta: {},
    month: monthOptions(6)[0],
    teacher: {
      name: "",
      email: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto",
      teacherID: "",
    },
  };

  const months = monthOptions(6);

  el.innerHTML = `
    <section class="fs-card">
      <div class="fs-row" style="justify-content:space-between;align-items:center;">
        <div>
          <h2 class="fs-h2">Teacher Availability</h2>
          <p class="fs-muted">Choose campuses, select weekly slots, then submit.</p>
        </div>
        <button type="button" id="ta-review" class="fs-btn fs-btn-primary">Review & Submit</button>
      </div>
    </section>

    <section class="fs-card" style="margin-top:12px;">
      <div class="fs-grid fs-grid-3">
        <div><label class="fs-label">Teacher</label><input id="ta-teacher" class="fs-input" disabled /></div>
        <div><label class="fs-label">Month</label><select id="ta-month" class="fs-select"></select></div>
        <div><label class="fs-label">Timezone</label><input id="ta-tz" class="fs-input" disabled /></div>
      </div>
      <div style="margin-top:10px;">
        <label class="fs-label">Campuses</label>
        <div id="ta-campus-list" class="fs-row" style="flex-wrap:wrap;gap:8px;"></div>
      </div>
    </section>

    <section class="fs-card" style="margin-top:12px;overflow:auto;">
      <div id="ta-grid"></div>
    </section>

    <aside class="fs-card" style="margin-top:12px;">
      <h3 class="fs-h3">Summary</h3>
      <div id="ta-summary" class="fs-muted">No slots selected.</div>
    </aside>

    <dialog id="ta-modal" class="fs-card" style="max-width:680px;width:90%;">
      <h3 class="fs-h3">Review Submission</h3>
      <div id="ta-modal-body" class="fs-muted" style="max-height:50vh;overflow:auto;margin:8px 0 12px;"></div>
      <div class="fs-row" style="justify-content:flex-end;gap:8px;">
        <button type="button" id="ta-cancel" class="fs-btn fs-btn-secondary">Cancel</button>
        <button type="button" id="ta-submit" class="fs-btn fs-btn-primary">Submit</button>
      </div>
    </dialog>

    <div id="ta-msg" class="fs-muted" style="margin-top:10px;"></div>
  `;

  const teacherInput = el.querySelector("#ta-teacher");
  const monthSelect = el.querySelector("#ta-month");
  const tzInput = el.querySelector("#ta-tz");
  const campusList = el.querySelector("#ta-campus-list");
  const grid = el.querySelector("#ta-grid");
  const summary = el.querySelector("#ta-summary");
  const reviewBtn = el.querySelector("#ta-review");
  const modal = el.querySelector("#ta-modal");
  const modalBody = el.querySelector("#ta-modal-body");
  const msg = el.querySelector("#ta-msg");

  function setMsg(text, kind = "") {
    msg.className = kind ? `fs-${kind}` : "fs-muted";
    msg.textContent = text || "";
  }

  months.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.key;
    opt.textContent = m.label;
    monthSelect.appendChild(opt);
  });

  const sessionEmail = String(new URLSearchParams(window.location.search).get("email") || "").trim().toLowerCase();

  state.campuses = await getCampuses();
  state.teachers = await getTeachers();

  const match = state.teachers.find((t) => String(t.teacherEmail || "").trim().toLowerCase() === sessionEmail) || state.teachers[0] || null;
  if (match) {
    state.teacher = {
      name: String(match.teacherName || ""),
      email: String(match.teacherEmail || ""),
      timezone: String(match.teacherTimezone || "America/Toronto"),
      teacherID: String(match.teacherID || ""),
    };
  }

  teacherInput.value = state.teacher.name ? `${state.teacher.name} (${state.teacher.email})` : (state.teacher.email || "Teacher not found");
  tzInput.value = state.teacher.timezone;

  state.campuses.forEach((c) => {
    state.selectionsByCampus[c.code] = new Set();
  });
  if (state.campuses[0]) {
    state.selectedCampusCodes.add(state.campuses[0].code);
    state.activeCampusCode = state.campuses[0].code;
  }

  function renderCampuses() {
    campusList.innerHTML = "";
    state.campuses.forEach((c) => {
      const on = state.selectedCampusCodes.has(c.code);
      const b = document.createElement("button");
      b.type = "button";
      b.className = on ? "fs-btn fs-btn-primary" : "fs-btn fs-btn-secondary";
      b.textContent = `${c.name} (${c.code})`;
      b.onclick = () => {
        if (on) state.selectedCampusCodes.delete(c.code); else state.selectedCampusCodes.add(c.code);
        if (!state.selectedCampusCodes.size) state.selectedCampusCodes.add(c.code);
        if (!state.selectedCampusCodes.has(state.activeCampusCode)) state.activeCampusCode = c.code;
        renderCampuses();
        renderGrid();
        renderSummary();
        void loadConflicts();
      };
      campusList.appendChild(b);
    });
  }

  function renderGrid() {
    const campusCode = state.activeCampusCode;
    const set = state.selectionsByCampus[campusCode] || new Set();
    let html = '<table class="fs-table"><thead><tr><th>Time</th>';
    for (const d of DAYS) html += `<th>${esc(d.slice(0, 3))}</th>`;
    html += '</tr></thead><tbody>';
    for (const t of SLOTS) {
      html += `<tr><td>${esc(t)}</td>`;
      for (const d of DAYS) {
        const k = slotKey(d, t);
        const blocked = state.blockedSlots.has(k);
        const on = set.has(k);
        const badge = blocked ? '<span class="fs-badge fs-badge-danger">Blocked</span>' : on ? '<span class="fs-badge fs-badge-success">Selected</span>' : '<span class="fs-badge fs-badge-neutral">-</span>';
        html += `<td><button type="button" data-k="${esc(k)}" class="fs-btn fs-btn-ghost" ${blocked ? 'disabled' : ''}>${badge}</button></td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    grid.innerHTML = html;
    grid.querySelectorAll("button[data-k]").forEach((b) => {
      b.addEventListener("click", () => {
        const k = b.getAttribute("data-k");
        const s = state.selectionsByCampus[campusCode] || new Set();
        if (s.has(k)) s.delete(k); else s.add(k);
        state.selectionsByCampus[campusCode] = s;
        renderGrid();
        renderSummary();
      });
    });
  }

  function renderSummary() {
    const lines = [];
    for (const code of state.selectedCampusCodes) {
      const count = (state.selectionsByCampus[code] || new Set()).size;
      lines.push(`${code}: ${count} slot${count === 1 ? "" : "s"}`);
    }
    const total = Array.from(state.selectedCampusCodes).reduce((acc, code) => acc + (state.selectionsByCampus[code] || new Set()).size, 0);
    summary.textContent = lines.length ? `${lines.join(" | ")} (Total: ${total})` : "No slots selected.";
  }

  async function loadExisting() {
    if (!state.teacher.email) return;
    const rows = await loadAvailability({ teacherEmail: state.teacher.email });
    rows.forEach((r) => {
      const code = String(r.campusCode || state.activeCampusCode || "");
      if (!state.selectionsByCampus[code]) state.selectionsByCampus[code] = new Set();
      state.selectionsByCampus[code].add(slotKey(String(r.teacherDay || ""), String(r.teacherTime || "")));
    });
  }

  async function loadConflicts() {
    const codes = Array.from(state.selectedCampusCodes);
    if (!codes.length) return;
    const conflicts = await getScheduledClassConflicts(codes.join(","));
    const blocked = new Set();
    const meta = {};
    (conflicts || []).forEach((c) => {
      const k = slotKey(String(c.day || ""), String(c.time || ""));
      blocked.add(k);
      meta[k] = c.label || "";
    });
    state.blockedSlots = blocked;
    state.blockedMeta = meta;
  }

  function buildPayload() {
    const out = [];
    for (const code of state.selectedCampusCodes) {
      const campus = state.campuses.find((c) => c.code === code);
      for (const key of (state.selectionsByCampus[code] || new Set())) {
        const [day, teacherTime] = String(key).split("__");
        out.push({
          teacherID: state.teacher.teacherID,
          teacherName: state.teacher.name,
          teacherEmail: state.teacher.email,
          teacherTimezone: state.teacher.timezone,
          campusCode: code,
          campusName: campus?.name || code,
          groupID: campus?.group || "",
          subgroupID: campus?.subgroup || "",
          teacherDay: day,
          teacherTime,
          dbTimeSlot: toTime24(teacherTime),
          month: state.month.month,
          year: state.month.year,
        });
      }
    }
    return out;
  }

  function openReview() {
    const payload = buildPayload();
    if (!payload.length) {
      setMsg("Select at least one slot before submitting.", "banner-warning");
      return;
    }
    modalBody.innerHTML = `<ul>${payload.map((p) => `<li>${esc(p.campusCode)} — ${esc(p.teacherDay)} ${esc(p.teacherTime)}</li>`).join("")}</ul>`;
    modal.showModal();
  }

  async function submitNow() {
    const payload = buildPayload();
    try {
      setMsg("Submitting availability...", "muted");
      const res = await submitAvailability(payload);
      setMsg(`Availability submitted. ${JSON.stringify(res)}`, "banner-success");
      modal.close();
    } catch (e) {
      setMsg(`Submission failed: ${String(e?.message || e)}`, "banner-danger");
    }
  }

  monthSelect.addEventListener("change", () => {
    state.month = months.find((m) => m.key === monthSelect.value) || months[0];
  });
  reviewBtn.addEventListener("click", openReview);
  el.querySelector("#ta-cancel").addEventListener("click", () => modal.close());
  el.querySelector("#ta-submit").addEventListener("click", submitNow);

  await loadExisting();
  await loadConflicts();
  renderCampuses();
  renderGrid();
  renderSummary();
}
