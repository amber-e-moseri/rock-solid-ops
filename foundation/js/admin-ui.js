(function attachAdminUi(global){
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  const FSAdminUi = {
    esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, c => escapeMap[c]);
    },
    fmtDate(value) {
      if (!value) return '—';
      try {
        return new Date(value).toLocaleDateString('en-CA');
      } catch (_) {
        return value;
      }
    },
    fmtTime(value) {
      if (!value) return '—';
      return String(value).substring(0, 5);
    },
    mkTable(heads, rows) {
      return `
      <div style="overflow:auto">
        <table>
          <thead><tr>${heads.map(h => `<th>${FSAdminUi.esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    }
  };

  global.FSAdminUi = FSAdminUi;
})(window);
