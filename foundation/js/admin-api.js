(function attachAdminApi(global){
  const FSAdminApi = {
    getConfig() {
      const url = String(global.FS_CONFIG?.SUPABASE_URL || '').trim();
      const anonKey = String(global.FS_CONFIG?.SUPABASE_ANON_KEY || '').trim();
      return { url, anonKey, unresolved: !url || !anonKey };
    },
    headers(anonKey, extra) {
      const base = {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      };
      return extra ? { ...base, ...extra } : base;
    },
    async supabaseGet(url, anonKey, table, params) {
      const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
        headers: FSAdminApi.headers(anonKey)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async supabasePatch(url, anonKey, table, params, body) {
      const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
        method: 'PATCH',
        headers: FSAdminApi.headers(anonKey, { Prefer: 'return=representation' }),
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async supabasePost(url, anonKey, table, body, prefer) {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: FSAdminApi.headers(anonKey, { Prefer: prefer || 'return=representation' }),
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    normalizeError(err) {
      if (!err) return 'Unknown error';
      if (typeof err === 'string') return err;
      return String(err.message || err);
    }
  };

  global.FSAdminApi = FSAdminApi;
})(window);
