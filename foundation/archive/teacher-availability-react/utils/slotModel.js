(function (global) {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const SLOTS = ["5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM"];

  const SAMPLE_CAMPUSES = [
    { code: "YORK", name: "York Campus" },
    { code: "DWTN", name: "Downtown Campus" },
    { code: "MISS", name: "Mississauga Campus" },
    { code: "REG", name: "Regional Online" }
  ];

  function detectTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
  }

  function slotKey(day, time) {
    return `${day}__${time}`;
  }

  function splitKey(key) {
    const [day, time] = String(key || "").split("__");
    return { day: day || "", time: time || "" };
  }

  function monthOptions(count) {
    const total = Number(count || 6);
    const now = new Date();
    return Array.from({ length: total }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        month: d.toLocaleDateString("en-US", { month: "long" }),
        year: d.getFullYear()
      };
    });
  }

  function emptySelections(campuses) {
    return Object.fromEntries((campuses || []).map((c) => [c.code, new Set()]));
  }

  function totalSelected(selectionsByCampus) {
    return Object.values(selectionsByCampus || {}).reduce((acc, set) => acc + (set ? set.size : 0), 0);
  }

  global.TASlotModel = {
    DAYS,
    SLOTS,
    SAMPLE_CAMPUSES,
    detectTimezone,
    slotKey,
    splitKey,
    monthOptions,
    emptySelections,
    totalSelected
  };
})(window);
