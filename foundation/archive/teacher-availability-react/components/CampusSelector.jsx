(function (global) {
  function CampusSelector({ campuses, currentCampusCode, onChange }) {
    return (
      <section className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 md:p-5">
        <label className="block text-xs font-semibold text-fs-muted mb-1">Campus</label>
        <select
          value={currentCampusCode}
          onChange={(e) => onChange(e.target.value)}
          className="w-full md:max-w-sm rounded-xl border border-fs-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-fs-lilacSoft bg-white"
        >
          {campuses.map((c) => (
            <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
          ))}
        </select>
      </section>
    );
  }

  global.TAComponents = global.TAComponents || {};
  global.TAComponents.CampusSelector = CampusSelector;
})(window);
