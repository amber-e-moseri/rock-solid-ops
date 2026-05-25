type TableResult = Record<string, unknown>;

type ResponseFactory = (ctx: {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  filters: Array<{ op: string; col: string; val: unknown }>;
  payload?: unknown;
  options?: unknown;
}) => Promise<{ data?: unknown; error?: unknown; count?: number | null }>;

export function mockSupabaseClient(responder: ResponseFactory) {
  const calls: Array<Record<string, unknown>> = [];

  function makeQuery(table: string) {
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    const base: any = {
      select(_cols?: string, _opts?: unknown) { calls.push({ table, action: "select", cols: _cols, opts: _opts }); return base; },
      eq(col: string, val: unknown) { filters.push({ op: "eq", col, val }); calls.push({ table, action: "eq", col, val }); return base; },
      ilike(col: string, val: unknown) { filters.push({ op: "ilike", col, val }); calls.push({ table, action: "ilike", col, val }); return base; },
      is(col: string, val: unknown) { filters.push({ op: "is", col, val }); calls.push({ table, action: "is", col, val }); return base; },
      in(col: string, val: unknown) { filters.push({ op: "in", col, val }); calls.push({ table, action: "in", col, val }); return base; },
      or(val: unknown) { calls.push({ table, action: "or", val }); return base; },
      order(col: string, opts?: unknown) { calls.push({ table, action: "order", col, opts }); return base; },
      limit(val: number) { calls.push({ table, action: "limit", val }); return base; },
      maybeSingle() { return responder({ table, action: "select", filters }); },
      single() { return responder({ table, action: "select", filters }); },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return responder({ table, action: "select", filters }).then(resolve, reject);
      },
      insert(payload: unknown) { calls.push({ table, action: "insert", payload }); return responder({ table, action: "insert", filters, payload }); },
      update(payload: unknown) {
        calls.push({ table, action: "update", payload });
        const chain: any = {
          eq(col: string, val: unknown) {
            filters.push({ op: "eq", col, val });
            calls.push({ table, action: "update.eq", col, val, payload });
            return responder({ table, action: "update", filters, payload });
          },
          lt(col: string, val: unknown) {
            filters.push({ op: "lt", col, val });
            calls.push({ table, action: "update.lt", col, val, payload });
            return chain;
          },
          select(_cols?: string) {
            calls.push({ table, action: "update.select", cols: _cols, payload });
            return responder({ table, action: "update", filters, payload });
          },
        };
        return chain;
      },
      upsert(payload: unknown, options?: unknown) {
        calls.push({ table, action: "upsert", payload, options });
        return responder({ table, action: "upsert", filters, payload, options });
      },
    };
    return base;
  }

  return {
    from(table: string) { return makeQuery(table); },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    __calls: calls,
  };
}

export function mockAuthUser(role: string, userId = "user-1") {
  return {
    id: userId,
    email: `${role}@example.com`,
    user_metadata: { full_name: role },
  };
}

export function mockTeacher(teacherId = "t-1", userId = "user-1") {
  return {
    teacher_id: teacherId,
    teacher_user_id: userId,
    full_name: "Teacher Test",
    email: "teacher@example.com",
    active: true,
    status: "ACTIVE",
    deleted_at: null,
  };
}
