(function (global) {
  function TeacherInfoCard({ teacher, setTeacher, monthKey, setMonthKey, monthOptions }) {
    return (
      <section className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg md:text-xl font-bold tracking-tight">Teacher Availability</h2>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-fs-lilacSoft text-fs-navy">Prototype</span>
        </div>
        <p className="text-sm text-fs-muted mb-4">Select your weekly availability by campus.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fs-muted mb-1">Name</label>
            <input
              value={teacher.name}
              onChange={(e) => setTeacher({ ...teacher, name: e.target.value })}
              placeholder="Teacher Name"
              className="w-full rounded-xl border border-fs-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-fs-lilacSoft"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fs-muted mb-1">Email</label>
            <input
              value={teacher.email}
              onChange={(e) => setTeacher({ ...teacher, email: e.target.value })}
              placeholder="name@foundationschool.org"
              className="w-full rounded-xl border border-fs-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-fs-lilacSoft"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fs-muted mb-1">Timezone (detected)</label>
            <input
              value={teacher.timezone}
              onChange={(e) => setTeacher({ ...teacher, timezone: e.target.value })}
              className="w-full rounded-xl border border-fs-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-fs-lilacSoft"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fs-muted mb-1">Month</label>
            <select
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className="w-full rounded-xl border border-fs-border px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-fs-lilacSoft bg-white"
            >
              {monthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </section>
    );
  }

  global.TAComponents = global.TAComponents || {};
  global.TAComponents.TeacherInfoCard = TeacherInfoCard;
})(window);
