(function (global) {
  function ReviewModal({ open, payload, loading, error, onClose, onConfirm }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-fs-border shadow-soft p-5">
          <h3 className="text-lg font-bold mb-1">Review Availability</h3>
          <p className="text-sm text-fs-muted mb-4">Confirm before submitting.</p>
          <div className="text-sm space-y-1 mb-4">
            <div><span className="font-semibold">Teacher:</span> {payload.teacherName || "-"}</div>
            <div><span className="font-semibold">Email:</span> {payload.teacherEmail || "-"}</div>
            <div><span className="font-semibold">Month:</span> {payload.monthLabel || "-"}</div>
            <div><span className="font-semibold">Total Slots:</span> {payload.totalCount}</div>
          </div>
          {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-fs-border text-sm">Cancel</button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-fs-navy disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Confirm Submit"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  global.TAComponents = global.TAComponents || {};
  global.TAComponents.ReviewModal = ReviewModal;
})(window);
