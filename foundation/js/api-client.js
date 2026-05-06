(function () {
  const API = (window.FSApi = window.FSApi || {});

  function formatError(err, fallback) {
    const msg = err?.message || err?.error_description || err?.error || fallback || "Unexpected error";
    return new Error(String(msg));
  }

  API._requireSupabase = function () {
    if (!window.supabase || typeof window.supabase.from !== "function") {
      throw new Error("Supabase client is not initialized on window.supabase.");
    }
    return window.supabase;
  };

  API.select = async function (table, queryBuilder) {
    try {
      const client = API._requireSupabase();
      let q = client.from(table).select("*");
      if (typeof queryBuilder === "function") q = queryBuilder(q) || q;
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw formatError(err, `Failed to load ${table}`);
    }
  };

  API.insert = async function (table, payload, select = true) {
    try {
      const client = API._requireSupabase();
      let q = client.from(table).insert(payload);
      if (select) q = q.select();
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw formatError(err, `Failed to insert into ${table}`);
    }
  };

  API.update = async function (table, payload, match, select = true) {
    try {
      const client = API._requireSupabase();
      let q = client.from(table).update(payload);
      Object.entries(match || {}).forEach(([k, v]) => {
        q = q.eq(k, v);
      });
      if (select) q = q.select();
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw formatError(err, `Failed to update ${table}`);
    }
  };

  API.upsert = async function (table, payload, options = {}, select = true) {
    try {
      const client = API._requireSupabase();
      let q = client.from(table).upsert(payload, options);
      if (select) q = q.select();
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw formatError(err, `Failed to upsert ${table}`);
    }
  };

  API.rpc = async function (fn, params = {}) {
    try {
      const client = API._requireSupabase();
      const { data, error } = await client.rpc(fn, params);
      if (error) throw error;
      return data;
    } catch (err) {
      throw formatError(err, `Failed to execute ${fn}`);
    }
  };

  API.invokeEdge = async function (functionName, body = {}) {
    try {
      const client = API._requireSupabase();
      const { data, error } = await client.functions.invoke(functionName, {
        body,
      });
      if (error) throw error;
      return data;
    } catch (err) {
      throw formatError(err, `Failed to invoke ${functionName}`);
    }
  };

  API.getSession = async function () {
    const client = API._requireSupabase();
    const { data, error } = await client.auth.getSession();
    if (error) throw formatError(error, "Failed to load auth session");
    return data?.session || null;
  };
})();
