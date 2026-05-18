(function (global) {
  const { splitKey } = global.TASlotModel;

  function SummaryPanel({ campuses, selectionsByCampus, onRemove, totalCount }) {
    const [open, setOpen] = React.useState(true);

    return (
      <aside className="bg-white border border-fs-border rounded-2xl shadow-soft p-4 md:p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold">Summary</h3>
          <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-fs-navy hover:underline">
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
        <p className="text-xs text-fs-muted mb-3">{totalCount} selected slot{totalCount === 1 ? "" : "s"} total</p>
        {!open && <p className="text-xs text-fs-muted">Summary hidden</p>}

        {open && (
          <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
            {campuses.map((c) => {
              const items = Array.from(selectionsByCampus[c.code] || []).sort();
              if (!items.length) return null;
              return (
                <div key={c.code} className="border border-fs-border rounded-xl p-3 bg-fs-cream2/60">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-xs font-bold text-fs-navy">{c.name}</div>
                    <div className="text-[11px] text-fs-muted">{items.length}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((k) => {
                      const { day, time } = splitKey(k);
                      return (
                        <span key={k} className="inline-flex items-center gap-1 text-[11px] border border-fs-border rounded-full px-2 py-1 bg-white">
                          {day.slice(0, 3)} {time}
                          <button type="button" className="text-red-600 font-bold" onClick={() => onRemove(c.code, k)}>x</button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {totalCount === 0 && <p className="text-xs text-fs-muted">No slots selected yet.</p>}
          </div>
        )}
      </aside>
    );
  }

  global.TAComponents = global.TAComponents || {};
  global.TAComponents.SummaryPanel = SummaryPanel;
})(window);
