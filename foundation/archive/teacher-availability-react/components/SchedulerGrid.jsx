(function (global) {
  const { DAYS, SLOTS, slotKey } = global.TASlotModel;

  function SchedulerGrid({ selectedSet, onToggle }) {
    return (
      <section className="bg-white border border-fs-border rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[100px_repeat(7,minmax(90px,1fr))] border-b border-fs-border bg-fs-cream2">
              <div className="p-3 text-xs font-semibold text-fs-muted">Time</div>
              {DAYS.map((d) => (
                <div key={d} className="p-3 text-xs font-semibold text-fs-navy border-l border-fs-border text-center">
                  {d}
                </div>
              ))}
            </div>

            {SLOTS.map((time) => (
              <div key={time} className="grid grid-cols-[100px_repeat(7,minmax(90px,1fr))] border-b border-fs-border last:border-b-0">
                <div className="p-3 text-xs font-semibold text-fs-muted bg-fs-cream2">{time}</div>
                {DAYS.map((day) => {
                  const key = slotKey(day, time);
                  const active = selectedSet.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggle(day, time)}
                      className={[
                        "border-l border-fs-border min-h-[56px] transition-all duration-150",
                        "hover:bg-fs-lilacSoft/50",
                        active
                          ? "bg-gradient-to-br from-fs-lilacSoft to-amber-100 ring-1 ring-inset ring-fs-lilac"
                          : "bg-white"
                      ].join(" ")}
                      aria-label={`${active ? "Remove" : "Add"} ${day} ${time}`}
                    >
                      {active ? <span className="text-xs font-bold text-fs-navy">Available</span> : <span className="sr-only">Inactive</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  global.TAComponents = global.TAComponents || {};
  global.TAComponents.SchedulerGrid = SchedulerGrid;
})(window);
