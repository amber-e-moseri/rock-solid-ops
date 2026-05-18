(function (global) {
  const {
    SAMPLE_CAMPUSES,
    detectTimezone,
    monthOptions,
    slotKey,
    splitKey,
    emptySelections,
    totalSelected
  } = global.TASlotModel;
  const { loadCampuses, loadAvailability, submitAvailability } = global.TAApi;

  const {
    TeacherInfoCard,
    CampusSelector,
    SchedulerGrid,
    SummaryPanel,
    ReviewModal
  } = global.TAComponents;

  function SuccessState({ onReset }) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white border border-fs-border rounded-2xl shadow-soft p-8 text-center">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-2xl font-bold flex items-center justify-center">✓</div>
        <h2 className="text-2xl font-bold mb-2">Availability Submitted</h2>
        <p className="text-fs-muted mb-5">Thank you. Your availability has been recorded in this prototype flow.</p>
        <button className="px-4 py-2 rounded-xl bg-fs-navy text-white font-semibold" onClick={onReset}>Submit Another</button>
      </div>
    );
  }

  function App() {
    const monthOpts = monthOptions(6);

    // Preserved state model
    const [teacher, setTeacher] = React.useState({
      name: "Pastor Jane Doe",
      email: "jane.doe@foundationschool.org",
      timezone: detectTimezone()
    });
    const [monthKey, setMonthKey] = React.useState(monthOpts[0].key);
    const [currentCampusCode, setCurrentCampusCode] = React.useState(SAMPLE_CAMPUSES[0].code);
    const [selectionsByCampus, setSelectionsByCampus] = React.useState(emptySelections(SAMPLE_CAMPUSES));
    const [reviewOpen, setReviewOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [submitted, setSubmitted] = React.useState(false);

    const [campuses, setCampuses] = React.useState(SAMPLE_CAMPUSES);
    const [bootLoading, setBootLoading] = React.useState(true);

    const currentMonth = monthOpts.find((m) => m.key === monthKey) || monthOpts[0];
    const currentSet = selectionsByCampus[currentCampusCode] || new Set();
    const totalCount = totalSelected(selectionsByCampus);

    React.useEffect(() => {
      async function boot() {
        setBootLoading(true);
        setError("");
        try {
          // Stubbed loading path for Stage 2.
          const loadedCampuses = await loadCampuses();
          const useCampuses = Array.isArray(loadedCampuses) && loadedCampuses.length ? loadedCampuses : SAMPLE_CAMPUSES;
          setCampuses(useCampuses);

          setSelectionsByCampus((prev) => {
            const next = emptySelections(useCampuses);
            Object.keys(prev || {}).forEach((code) => {
              if (next[code]) next[code] = new Set(prev[code]);
            });
            return next;
          });
          if (!useCampuses.find((c) => c.code === currentCampusCode)) {
            setCurrentCampusCode(useCampuses[0].code);
          }

          // Stage 3 target: preload saved availability here.
          const loadedAvailability = await loadAvailability({
            teacherEmail: teacher.email || "",
            teacherName: teacher.name || "",
            teacherTimezone: teacher.timezone || "",
            month: currentMonth.month,
            year: currentMonth.year
          });

          if (Array.isArray(loadedAvailability) && loadedAvailability.length) {
            setSelectionsByCampus((prev) => {
              const next = { ...prev };
              loadedAvailability.forEach((item) => {
                const campusCode = String(item.campusCode || "");
                if (!next[campusCode]) next[campusCode] = new Set();
                next[campusCode].add(slotKey(String(item.day || ""), String(item.time || "")));
              });
              return next;
            });
          }
        } catch (e) {
          setError(String((e && e.message) || e || "Failed to initialize scheduler"));
        } finally {
          setBootLoading(false);
        }
      }
      boot();
    }, []);

    function toggleSlot(day, time) {
      const key = slotKey(day, time);
      setSelectionsByCampus((prev) => {
        const next = { ...prev };
        const set = new Set(next[currentCampusCode] || []);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        next[currentCampusCode] = set;
        return next;
      });
    }

    function removeSlot(campusCode, key) {
      setSelectionsByCampus((prev) => {
        const next = { ...prev };
        const set = new Set(next[campusCode] || []);
        set.delete(key);
        next[campusCode] = set;
        return next;
      });
    }

    // Preserved payload builder
    function buildPayload() {
      const entries = [];
      campuses.forEach((c) => {
        const set = selectionsByCampus[c.code] || new Set();
        set.forEach((k) => {
          const parsed = splitKey(k);
          entries.push({
            teacherID: "",
            teacherName: teacher.name.trim(),
            teacherEmail: teacher.email.trim(),
            teacherTimezone: teacher.timezone.trim(),
            campusCode: c.code,
            campusName: c.name,
            day: parsed.day,
            time: parsed.time,
            month: currentMonth.month,
            year: currentMonth.year,
            status: "PENDING",
            adminApproved: false,
            submittedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        });
      });
      return entries;
    }

    async function handleConfirmSubmit() {
      setLoading(true);
      setError("");
      try {
        const payload = buildPayload();
        if (!payload.length) throw new Error("Select at least one slot before submitting.");
        await submitAvailability(payload);
        setSubmitted(true);
        setReviewOpen(false);
      } catch (e) {
        setError(String((e && e.message) || e || "Submit failed"));
      } finally {
        setLoading(false);
      }
    }

    function handleReset() {
      setSubmitted(false);
      setReviewOpen(false);
      setError("");
      setSelectionsByCampus(emptySelections(campuses));
    }

    const canSubmit = teacher.name.trim() && teacher.email.trim() && totalCount > 0;
    const reviewPayload = {
      teacherName: teacher.name.trim(),
      teacherEmail: teacher.email.trim(),
      monthLabel: currentMonth.label,
      totalCount
    };

    if (submitted) return <SuccessState onReset={handleReset} />;

    return (
      <main className="max-w-7xl mx-auto px-3 md:px-6 py-5 md:py-8">
        <header className="mb-4 md:mb-6">
          <div className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-fs-lilacSoft text-fs-navy mb-2">
            {global.TA_CONFIG && global.TA_CONFIG.appName ? global.TA_CONFIG.appName : "Foundation School Scheduler"}
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1">Calendly-style Teacher Availability</h1>
          <p className="text-sm md:text-base text-fs-muted">Clean weekly scheduling experience for campus-based class availability.</p>
        </header>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {bootLoading ? (
          <div className="bg-white border border-fs-border rounded-2xl shadow-soft p-6 text-sm text-fs-muted">Loading scheduler...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 md:gap-5">
            <div className="space-y-4">
              <TeacherInfoCard
                teacher={teacher}
                setTeacher={setTeacher}
                monthKey={monthKey}
                setMonthKey={setMonthKey}
                monthOptions={monthOpts}
              />
              <CampusSelector
                campuses={campuses}
                currentCampusCode={currentCampusCode}
                onChange={setCurrentCampusCode}
              />
              <SchedulerGrid selectedSet={currentSet} onToggle={toggleSlot} />

              <div className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 flex items-center justify-between gap-2">
                <p className="text-sm text-fs-muted">Ready to submit your selected availability?</p>
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  disabled={!canSubmit}
                  className="px-4 py-2 rounded-xl bg-fs-navy text-white font-semibold disabled:opacity-50"
                >
                  Submit
                </button>
              </div>
            </div>

            <SummaryPanel
              campuses={campuses}
              selectionsByCampus={selectionsByCampus}
              onRemove={removeSlot}
              totalCount={totalCount}
            />
          </div>
        )}

        <ReviewModal
          open={reviewOpen}
          payload={reviewPayload}
          loading={loading}
          error={error}
          onClose={() => setReviewOpen(false)}
          onConfirm={handleConfirmSubmit}
        />
      </main>
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
})(window);
