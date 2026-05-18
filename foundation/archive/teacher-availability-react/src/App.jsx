import React from "react";
import { getCampuses, getTeachers, getScheduledClassConflicts, loadAvailability, submitAvailability, buildDefaultConfig } from "./availabilityApi";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = [
  "6:00 AM",
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM"
];

const GROUP_LABELS = { CE: "Central East", CS: "Central South", WS: "West" };
const SUBGROUP_LABELS = {
  CESGA: "CESGA (Prairies)",
  CESGB: "CESGB (Atlantic)",
  CSGA: "CSGA (GTA/Ottawa/QC)",
  CSGB: "CSGB (Waterloo/West GTA)",
  WSGA: "WSGA (AB/BC)",
  WSGB: "WSGB (Southern AB)"
};

const FALLBACK_CAMPUSES = [
  { code: "CMU", name: "Canadian Mennonite University", group: "CE", subgroup: "CESGA", timezone: "America/Winnipeg" },
  { code: "YORK", name: "York University", group: "CS", subgroup: "CSGA", timezone: "America/Toronto" },
  { code: "UTM", name: "University of Toronto Mississauga", group: "CS", subgroup: "CSGB", timezone: "America/Toronto" },
  { code: "UALBERTA", name: "University of Alberta", group: "WS", subgroup: "WSGA", timezone: "America/Edmonton" }
];

function slotKey(day, time) {
  return `${day}__${time}`;
}
function splitKey(k) {
  const [day, time] = String(k || "").split("__");
  return { day: day || "", time: time || "" };
}
function dayIdx(day) {
  return DAYS.indexOf(String(day || "").trim());
}
function minsFrom12h(time12) {
  const m = String(time12 || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const ap = String(m[3]).toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + mi;
}
function tzOffsetMs(instant, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const p = {};
  dtf.formatToParts(instant).forEach((x) => { p[x.type] = x.value; });
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - instant.getTime();
}
function wallClockToInstant(y, mo, d, time12, tz) {
  const mins = minsFrom12h(time12);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const mi = mins % 60;
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off1 = tzOffsetMs(new Date(naive), tz);
  const adj = naive - off1;
  const off2 = tzOffsetMs(new Date(adj), tz);
  return new Date(off1 === off2 ? adj : adj - off2 + off1);
}
function tzAbbrev(tz) {
  if (tz === "America/Toronto") return "ET";
  if (tz === "America/Winnipeg" || tz === "America/Regina") return "CT";
  if (tz === "America/Edmonton") return "MT";
  if (tz === "America/Vancouver") return "PT";
  return "LT";
}
function convertToCampusTz(day, time12, teacherTz, campusTz) {
  const di = dayIdx(day);
  if (di < 0 || !time12 || !teacherTz || !campusTz) return null;
  const baseMondayUtc = new Date(Date.UTC(2026, 0, 5));
  const t = new Date(baseMondayUtc.getTime());
  t.setUTCDate(t.getUTCDate() + di);
  const instant = wallClockToInstant(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), time12, teacherTz);
  if (!instant) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: campusTz,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(instant);
  let outDay = "";
  let h = "";
  let mi = "";
  let ap = "";
  parts.forEach((p) => {
    if (p.type === "weekday") outDay = p.value;
    if (p.type === "hour") h = p.value;
    if (p.type === "minute") mi = p.value;
    if (p.type === "dayPeriod") ap = String(p.value || "").toUpperCase();
  });
  return { day: outDay || day, time: h && mi ? `${h}:${mi} ${ap}` : time12, abbr: tzAbbrev(campusTz) };
}
function monthOptions(n = 6) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      month: d.toLocaleDateString("en-US", { month: "long" }),
      year: d.getFullYear()
    };
  });
}

function SuccessState({ onReset, teacherName, totalCount, campusCount }) {
  return (
    <div className="max-w-xl mx-auto mt-12 bg-white border border-fs-border rounded-2xl shadow-soft p-8 text-center fade-in">
      <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-3xl">✓</div>
      <h2 className="text-2xl font-bold mb-1">Availability Submitted</h2>
      <p className="text-fs-muted text-sm mb-1">{teacherName}</p>
      <p className="text-fs-muted text-sm mb-6">
        {totalCount} slots across {campusCount} campus{campusCount !== 1 ? "es" : ""}
      </p>
      <button className="px-5 py-2.5 rounded-xl bg-fs-navy text-white font-semibold hover:bg-fs-navy2 transition-colors" onClick={onReset}>
        Submit Another
      </button>
    </div>
  );
}

export default function App() {
  const cfg = React.useMemo(() => {
    window.TA_CONFIG = window.TA_CONFIG || buildDefaultConfig();
    return window.TA_CONFIG;
  }, []);
  const monthOpts = React.useMemo(() => monthOptions(6), []);

  const [campuses, setCampuses] = React.useState(FALLBACK_CAMPUSES);
  const allCampusesRef = React.useRef(FALLBACK_CAMPUSES);
  const [teachers, setTeachers] = React.useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState("");
  const [teacher, setTeacher] = React.useState({
    name: "",
    email: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto"
  });
  const [monthKey, setMonthKey] = React.useState(monthOpts[0].key);
  const [selectedCampusCodes, setSelectedCampusCodes] = React.useState(new Set());
  const [activeCampusCode, setActiveCampusCode] = React.useState("");
  const [selectionsByCampus, setSelectionsByCampus] = React.useState({});
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [bootLoading, setBootLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [campusLoadWarning, setCampusLoadWarning] = React.useState("");
  const [conflictWarning, setConflictWarning] = React.useState("");
  const [blockedSlots, setBlockedSlots] = React.useState(new Set());
  const [blockedMeta, setBlockedMeta] = React.useState({});
  const [submitted, setSubmitted] = React.useState(false);
  const [submitSnapshot, setSubmitSnapshot] = React.useState(null);

  const currentMonth = monthOpts.find((m) => m.key === monthKey) || monthOpts[0];

  React.useEffect(() => {
    const urlEmail = String(new URLSearchParams(window.location.search).get("email") || "").trim();
    if (urlEmail) {
      setTeacher((prev) => ({ ...prev, email: prev.email || urlEmail }));
    }

    function onTeacherContext(event) {
      const data = event?.data || {};
      if (data.type !== "FS_TEACHER_CONTEXT") return;
      const contextEmail = String(data.email || "").trim();
      const contextName = String(data.name || "").trim();
      if (!contextEmail && !contextName) return;
      setTeacher((prev) => ({
        ...prev,
        email: contextEmail || prev.email,
        name: contextName || prev.name
      }));
    }

    window.addEventListener("message", onTeacherContext);
    return () => window.removeEventListener("message", onTeacherContext);
  }, []);

  React.useEffect(() => {
    (async () => {
      setBootLoading(true);
      try {
        const [loadedCampuses, loadedTeachers] = await Promise.all([getCampuses(), getTeachers()]);
        console.log("[TA DEBUG] campus API raw normalized response:", loadedCampuses);
        const useCampuses = Array.isArray(loadedCampuses) ? loadedCampuses : [];
        const useTeachers = Array.isArray(loadedTeachers) ? loadedTeachers : [];
        if (!useCampuses.length) {
          setCampusLoadWarning("Live FELLOWSHIP_MAP campus load returned 0 rows. Check FELLOWSHIP_MAP Active/headers/data.");
        } else {
          setCampusLoadWarning("");
        }
        setCampuses(useCampuses);
        allCampusesRef.current = useCampuses;
        setTeachers(useTeachers);
        setSelectionsByCampus((prev) => {
          const next = Object.fromEntries(useCampuses.map((c) => [c.code, new Set()]));
          Object.keys(prev || {}).forEach((code) => {
            if (next[code]) next[code] = new Set(prev[code]);
          });
          return next;
        });
        if (activeCampusCode && !useCampuses.find((c) => c.code === activeCampusCode)) {
          setActiveCampusCode("");
        }
      } catch (e) {
        console.error("[TA DEBUG] Live FELLOWSHIP_MAP campus load failed; fallback list is being used.", e);
        const reason = String(e?.message || e || "unknown_error");
        setCampusLoadWarning(`Live FELLOWSHIP_MAP campus load failed; fallback list is being used. Reason: ${reason}`);
        setCampuses(FALLBACK_CAMPUSES);
        allCampusesRef.current = FALLBACK_CAMPUSES;
        setSelectionsByCampus((prev) => {
          const next = Object.fromEntries(FALLBACK_CAMPUSES.map((c) => [c.code, new Set()]));
          Object.keys(prev || {}).forEach((code) => {
            if (next[code]) next[code] = new Set(prev[code]);
          });
          return next;
        });
        console.error(e);
        setError(String(e?.message || e));
      } finally {
        setBootLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    const email = String(teacher.email || "").trim().toLowerCase();
    if (!email || !Array.isArray(teachers) || !teachers.length) return;
    const match = teachers.find((t) => String(t.teacherEmail || "").trim().toLowerCase() === email);
    if (!match) return;
    setSelectedTeacherId((prev) => prev || String(match.teacherID || ""));
    setTeacher((prev) => ({
      ...prev,
      name: prev.name || String(match.teacherName || ""),
      email: prev.email || String(match.teacherEmail || ""),
      timezone: prev.timezone || String(match.teacherTimezone || "America/Toronto")
    }));
  }, [teachers, teacher.email]);

  React.useEffect(() => {
    const email = teacher.email.trim();
    if (!email || !email.includes("@") || !email.includes(".") || !currentMonth) return;
    const timer = setTimeout(async () => {
      try {
        const rows = await loadAvailability({
          teacherEmail: email,
          teacherName: teacher.name,
          teacherTimezone: teacher.timezone,
          month: currentMonth.month,
          year: currentMonth.year
        });
        if (!Array.isArray(rows) || !rows.length) return;
        setSelectionsByCampus((prev) => {
          const next = { ...prev };
          rows.forEach((r) => {
            const code = String(r.campusCode || "");
            if (!next[code]) next[code] = new Set();
            next[code].add(
              slotKey(
                String(r.teacherDay || r.day || ""),
                String(r.teacherTime || r.time || "")
              )
            );
          });
          return next;
        });
      } catch (e) {
        console.error("loadAvailability:", e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [teacher.email, teacher.name, teacher.timezone, monthKey]);

  React.useEffect(() => {
    const codes = Array.from(selectedCampusCodes);
    if (!codes.length) {
      setBlockedSlots(new Set());
      setBlockedMeta({});
      setConflictWarning("");
      return;
    }
    (async () => {
      try {
        console.log("[TA DEBUG] selected campuses for conflict load:", codes);
        const conflicts = await getScheduledClassConflicts(codes.join(","));
        const nextBlocked = new Set();
        const nextMeta = {};
        (conflicts || []).forEach((c) => {
          const k = slotKey(String(c.day || ""), String(c.time || ""));
          if (!k || k === "__") return;
          nextBlocked.add(k);
          nextMeta[k] = String(c.label || "");
        });
        console.log("[TA DEBUG] blocked slots loaded:", Array.from(nextBlocked));
        setBlockedSlots(nextBlocked);
        setBlockedMeta(nextMeta);

        let removed = 0;
        setSelectionsByCampus((prev) => {
          const next = { ...prev };
          codes.forEach((code) => {
            const set = new Set(next[code] || []);
            Array.from(nextBlocked).forEach((k) => {
              if (set.delete(k)) removed++;
            });
            next[code] = set;
          });
          return next;
        });
        if (removed > 0) {
          setConflictWarning("Some selected times were removed because they conflict with existing scheduled classes.");
          console.log("[TA DEBUG] conflicts removed:", removed);
        } else {
          setConflictWarning("");
        }
      } catch (err) {
        console.error("[TA DEBUG] conflict load failed:", err);
        setBlockedSlots(new Set());
        setBlockedMeta({});
        setConflictWarning("Unable to load scheduled class conflicts.");
      }
    })();
  }, [selectedCampusCodes]);

  const currentSet = selectionsByCampus[activeCampusCode] || new Set();
  const campusByCode = React.useMemo(
    () => Object.fromEntries((allCampusesRef.current || campuses).map((c) => [c.code, c])),
    [campuses]
  );
  const selectedCampusList = React.useMemo(
    () => Array.from(selectedCampusCodes).map((code) => campusByCode[code]).filter(Boolean),
    [selectedCampusCodes, campusByCode]
  );
  const calendarTitle = React.useMemo(() => {
    const names = selectedCampusList.map((c) => c.name || c.code);
    if (!names.length) return "No campus selected";
    if (names.length === 1) return names[0];
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} + ${names.length - 1} more`;
  }, [selectedCampusList]);
  const totalCount = Array.from(selectedCampusCodes).reduce((acc, code) => acc + (selectionsByCampus[code] || new Set()).size, 0);

  function toggleCampus(code) {
    setSelectedCampusCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        if (activeCampusCode === code) setActiveCampusCode(Array.from(next)[0] || "");
      } else {
        next.add(code);
        setActiveCampusCode(code);
      }
      return next;
    });
  }
  function toggleSlot(day, time) {
    const k = slotKey(day, time);
    if (blockedSlots.has(k)) return;
    setSelectionsByCampus((prev) => {
      const next = { ...prev };
      const set = new Set(next[activeCampusCode] || []);
      if (set.has(k)) set.delete(k);
      else set.add(k);
      next[activeCampusCode] = set;
      return next;
    });
  }
  function removeSlot(campusCode, k) {
    setSelectionsByCampus((prev) => {
      const next = { ...prev };
      const set = new Set(next[campusCode] || []);
      set.delete(k);
      next[campusCode] = set;
      return next;
    });
  }

  function buildPayload() {
    const entries = [];
    selectedCampusCodes.forEach((code) => {
      const campus = campuses.find((c) => c.code === code);
      (selectionsByCampus[code] || new Set()).forEach((k) => {
        const { day, time } = splitKey(k);
        entries.push({
          teacherID: selectedTeacherId || "",
          teacherName: teacher.name.trim(),
          teacherEmail: teacher.email.trim(),
          teacherTimezone: teacher.timezone.trim(),
          campusCode: code,
          campusName: campus ? campus.name : code,
          groupID: campus ? campus.group : "",
          subgroupID: campus ? campus.subgroup : "",
          teacherDay: day,
          teacherTime: time,
          month: currentMonth.month,
          year: currentMonth.year,
          status: "PENDING",
          adminApproved: false,
          submittedAt: new Date().toISOString()
        });
      });
    });
    return entries;
  }

  async function handleConfirmSubmit() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const hasConflict = Array.from(selectedCampusCodes).some((code) => {
        const set = selectionsByCampus[code] || new Set();
        return Array.from(set).some((k) => blockedSlots.has(k));
      });
      if (hasConflict) {
        throw new Error("Some selected times are already scheduled for the selected campuses/classes. Please remove them before submitting.");
      }
      const payload = buildPayload();
      if (!payload.length) throw new Error("Select at least one slot before submitting.");
      console.log("[TA DEBUG] final payload submitted:", payload);
      await submitAvailability(payload);
      const resetSelections = Object.fromEntries((allCampusesRef.current || campuses).map((c) => [c.code, new Set()]));
      setSelectionsByCampus(resetSelections);
      setSelectedCampusCodes(new Set());
      setActiveCampusCode("");
      setSelectedTeacherId("");
      setTeacher({
        name: "",
        email: "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto"
      });
      setSubmitSnapshot({ totalCount, campusCount: selectedCampusCodes.size, teacherName: teacher.name });
      setSubmitted(true);
      setReviewOpen(false);
    } catch (e) {
      console.error("submitAvailability:", e);
      setError(String(e?.message || e || "Submit failed"));
    } finally {
      setLoading(false);
    }
  }

  if (submitted && submitSnapshot) {
    return (
      <main className="max-w-7xl mx-auto px-3 md:px-6 py-8">
        <SuccessState
          onReset={() => window.location.reload()}
          teacherName={submitSnapshot.teacherName}
          totalCount={submitSnapshot.totalCount}
          campusCount={submitSnapshot.campusCount}
        />
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-5 md:py-8">
      <header className="mb-5 md:mb-7">
        <div className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-fs-lilacSoft text-fs-navy mb-2">
          {cfg.appName || "Foundation School Scheduler"}
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1">Teacher Availability</h1>
        <p className="text-sm text-fs-muted">Select your campuses and set your available time slots for each one.</p>
      </header>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}
      {campusLoadWarning && <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{campusLoadWarning}</div>}
      {conflictWarning && <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{conflictWarning}</div>}
      {bootLoading ? (
        <div className="bg-white border border-fs-border rounded-2xl shadow-soft p-6 text-sm text-fs-muted">Loading scheduler...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 md:gap-5">
          <div className="space-y-4">
            <section className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 md:p-5">
              <h2 className="text-lg font-bold tracking-tight mb-3">Teacher Availability</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={selectedTeacherId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedTeacherId(nextId);
                    const t = teachers.find((x) => String(x.teacherID || "") === String(nextId));
                    if (!t) return;
                    setTeacher((prev) => ({
                      ...prev,
                      name: String(t.teacherName || ""),
                      email: String(t.teacherEmail || ""),
                      timezone: String(t.teacherTimezone || prev.timezone || "America/Toronto")
                    }));
                  }}
                  className="w-full rounded-xl border border-fs-border px-3 py-2.5 bg-white"
                >
                  <option value="">Select Teacher from Sheet</option>
                  {teachers.map((t) => (
                    <option key={t.teacherID || `${t.teacherEmail}-${t.teacherName}`} value={t.teacherID || ""}>
                      {t.teacherName} {t.teacherEmail ? `(${t.teacherEmail})` : ""}
                    </option>
                  ))}
                </select>
                <input value={teacher.name} onChange={(e) => setTeacher({ ...teacher, name: e.target.value })} className="w-full rounded-xl border border-fs-border px-3 py-2.5" placeholder="Teacher Name" />
                <input value={teacher.email} onChange={(e) => setTeacher({ ...teacher, email: e.target.value })} className="w-full rounded-xl border border-fs-border px-3 py-2.5" placeholder="name@foundationschool.org" />
                <div className="relative">
                  <label className="block text-xs font-semibold text-fs-muted mb-1">Timezone</label>
                  <input
                    value={teacher.timezone}
                    onChange={(e) => setTeacher({ ...teacher, timezone: e.target.value })}
                    className="w-full rounded-xl border border-fs-border px-3 py-2.5"
                    placeholder="e.g. America/Toronto"
                  />
                </div>
                <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="w-full rounded-xl border border-fs-border px-3 py-2.5 bg-white">
                  {monthOpts.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
            </section>

            <section className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 md:p-5">
              <input type="text" placeholder="Search campus or code..." className="search-input w-full rounded-xl border border-fs-border px-3 py-2 text-sm mb-4 bg-fs-cream2" onChange={(e) => {
                const v = e.target.value.toLowerCase();
                if (!v) return setCampuses(allCampusesRef.current);
                setCampuses(
                  allCampusesRef.current.filter((c) =>
                    String(c.name || "").toLowerCase().includes(v) ||
                    String(c.code || "").toLowerCase().includes(v)
                  )
                );
              }} />
              {Object.entries(campuses.reduce((acc, c) => {
                acc[c.group] = acc[c.group] || {};
                acc[c.group][c.subgroup] = acc[c.group][c.subgroup] || [];
                acc[c.group][c.subgroup].push(c);
                return acc;
              }, {})).map(([group, sub]) => (
                <div key={group} className="mb-4">
                  <div className="group-header">{GROUP_LABELS[group] || group}</div>
                  {Object.keys(sub).map((s) => (
                    <div key={s} className="mb-2">
                      <div className="text-[10px] font-semibold text-fs-muted mb-2 tracking-wide">{SUBGROUP_LABELS[s] || s}</div>
                      <div className="flex flex-wrap gap-2">
                        {sub[s].map((c) => {
                          const checked = selectedCampusCodes.has(c.code);
                          const slotCount = (selectionsByCampus[c.code] || new Set()).size;
                          return (
                            <label key={c.code} className={`campus-pill ${checked ? "checked" : ""}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleCampus(c.code)} />
                              <span className="pill-inner">
                                <span className="check-icon">✓</span>
                                <span>{c.code}</span>
                                <span className="text-[10px] opacity-70 hidden sm:inline truncate max-w-[120px]">{c.name.split(" ").slice(0, 3).join(" ")}</span>
                                {slotCount > 0 && <span className="slot-badge">{slotCount}</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </section>

            {selectedCampusCodes.size > 0 && (
              <>
                <div className="bg-white border border-fs-border rounded-2xl shadow-soft p-3">
                  <div className="text-xs font-semibold text-fs-muted mb-2">Calendar: {calendarTitle}</div>
                  <div className="flex gap-2 flex-wrap">
                    {campuses.filter((c) => selectedCampusCodes.has(c.code)).map((c) => (
                      <button key={c.code} type="button" onClick={() => setActiveCampusCode(c.code)} className={`tab-btn px-3 py-1.5 rounded-xl border text-sm font-semibold ${activeCampusCode === c.code ? "active" : "border-fs-border bg-white"}`}>
                        {c.code}
                      </button>
                    ))}
                  </div>
                </div>
                <section className="bg-white border border-fs-border rounded-2xl shadow-soft overflow-hidden">
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: "720px" }}>
                      <div className="grid border-b border-fs-border bg-fs-cream2" style={{ gridTemplateColumns: "88px repeat(7,1fr)" }}>
                        <div className="p-2.5 text-[11px] font-semibold text-fs-muted">Time</div>
                        {DAYS.map((d) => <div key={d} className="p-2.5 border-l border-fs-border text-center text-[11px] font-bold text-fs-navy">{d.slice(0, 3)}</div>)}
                      </div>
                      {SLOTS.map((time) => (
                        <div key={time} className="grid border-b border-fs-border last:border-b-0" style={{ gridTemplateColumns: "88px repeat(7,1fr)" }}>
                          <div className="p-2.5 text-[11px] font-semibold text-fs-muted bg-fs-cream2 flex items-center">{time}</div>
                          {DAYS.map((day) => {
                            const k = slotKey(day, time);
                            const active = currentSet.has(k);
                            const blocked = blockedSlots.has(k);
                            const blockedLabel = blockedMeta[k] || "Already scheduled";
                            const activeCampus = campuses.find((c) => c.code === activeCampusCode);
                            const conv = activeCampus
                              ? convertToCampusTz(day, time, teacher.timezone || "America/Toronto", activeCampus.timezone || "America/Toronto")
                              : null;
                            return (
                              <div
                                key={k}
                                title={blocked ? blockedLabel : ""}
                                className={`slot-cell border-l border-fs-border min-h-[44px] flex items-center justify-center ${blocked ? "bg-red-50 text-red-700 cursor-not-allowed" : "cursor-pointer"} ${active ? "active" : ""}`}
                                onClick={() => toggleSlot(day, time)}
                              >
                                {blocked ? (
                                  <span className="text-[9px] px-1 text-center">Blocked</span>
                                ) : active ? (
                                  <div className="flex flex-col items-center leading-none">
                                    <span>OK</span>
                                    {conv ? <span className="text-[9px] opacity-80">-&gt; {conv.time} {conv.abbr}</span> : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

            <div className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 flex items-center justify-between gap-2">
              <p className="text-sm text-fs-muted">
                {totalCount > 0 ? `${totalCount} slot${totalCount !== 1 ? "s" : ""} selected across ${selectedCampusCodes.size} campuses` : "Ready to submit? Select your slots first."}
              </p>
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                disabled={
                  loading ||
                  !teacher.name.trim() ||
                  !teacher.email.trim() ||
                  !teacher.email.includes("@") ||
                  !teacher.email.includes(".") ||
                  totalCount === 0
                }
                className="px-5 py-2 rounded-xl bg-fs-navy text-white font-semibold disabled:opacity-40 hover:bg-fs-navy2 transition-colors"
              >
                Review & Submit
              </button>
            </div>
          </div>

          <aside className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 md:p-5">
            <h3 className="text-sm font-bold mb-2">Summary</h3>
            <p className="text-xs text-fs-muted mb-3">{selectedCampusCodes.size} campuses · {totalCount} slots</p>
            <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
              {campuses.filter((c) => selectedCampusCodes.has(c.code)).map((c) => {
                const items = Array.from(selectionsByCampus[c.code] || []).sort();
                return (
                  <div key={c.code} className="border border-fs-border rounded-xl p-3 bg-fs-cream2/60">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-fs-navy">{c.code}</span>
                      <span className="text-[10px] text-fs-muted">{items.length} slots</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {items.map((k) => {
                        const { day, time } = splitKey(k);
                        const conv = convertToCampusTz(day, time, teacher.timezone || "America/Toronto", c.timezone || "America/Toronto");
                        return (
                          <span key={k} className="inline-flex items-center gap-1 text-[11px] border border-fs-border rounded-full px-2 py-0.5 bg-white">
                            {day.slice(0, 3)} {time}{conv ? ` -> ${conv.time} ${conv.abbr}` : ""}
                            <button type="button" onClick={() => removeSlot(c.code, k)} className="text-fs-muted hover:text-red-500 font-bold ml-0.5 leading-none">×</button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {reviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setReviewOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl border border-fs-border shadow-soft p-5 max-h-[90vh] overflow-y-auto fade-in">
            <h3 className="text-lg font-bold mb-1">Review & Submit</h3>
            <p className="text-sm text-fs-muted mb-4">Confirm your availability before submitting.</p>
            <div className="bg-fs-cream2 rounded-xl p-3 mb-4 text-sm space-y-1">
              <div><span className="font-semibold">Name:</span> {teacher.name || "—"}</div>
              <div><span className="font-semibold">Email:</span> {teacher.email || "—"}</div>
              <div><span className="font-semibold">Timezone:</span> {teacher.timezone || "—"}</div>
              <div><span className="font-semibold">Month:</span> {currentMonth.label}</div>
              <div><span className="font-semibold">Total:</span> {totalCount} slots across {selectedCampusCodes.size} campuses</div>
              {Array.from(selectedCampusCodes).slice(0, 3).map((code) => {
                const c = campuses.find((x) => x.code === code);
                const first = Array.from(selectionsByCampus[code] || [])[0];
                if (!c || !first) return null;
                const s = splitKey(first);
                const conv = convertToCampusTz(s.day, s.time, teacher.timezone || "America/Toronto", c.timezone || "America/Toronto");
                if (!conv) return null;
                return <div key={code}><span className="font-semibold">{code}:</span> {s.day} {s.time} -&gt; {conv.day} {conv.time} {conv.abbr}</div>;
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReviewOpen(false)} className="px-4 py-2 rounded-xl border border-fs-border text-sm hover:bg-fs-cream2">Cancel</button>
              <button type="button" onClick={handleConfirmSubmit} disabled={loading} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-fs-navy hover:bg-fs-navy2 disabled:opacity-50 transition-colors">
                {loading ? "Submitting..." : "Confirm Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
