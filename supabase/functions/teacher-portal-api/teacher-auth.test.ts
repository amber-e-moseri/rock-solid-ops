import { resolveAuthContext } from "./_lib/teacher-auth.ts";
import { ApiError } from "./_lib/errors.ts";
import { mockSupabaseClient, mockAuthUser, mockTeacher } from "../_shared/test-utils.ts";

function req() {
  return new Request("https://example.com", { headers: { Authorization: "Bearer token" } });
}

Deno.test("Role policy: teacher role resolves teacher context", async () => {
  const db = mockSupabaseClient(async ({ table, action }) => {
    if (table === "profiles" && action === "select") return { data: { role: "teacher", is_active: true }, error: null };
    if (table === "teachers" && action === "select") return { data: [mockTeacher("t1", "u1")], error: null };
    return { data: null, error: null };
  });

  const ctx = await resolveAuthContext(req(), db as any, {
    createAuthClient: (() => ({ auth: { getUser: async () => ({ data: { user: mockAuthUser("teacher", "u1") }, error: null }) } })) as any,
    withTimeoutFn: (p: Promise<any>) => p,
  });

  if (ctx.role !== "teacher" || !ctx.teacherMapped || ctx.teacher.teacherId !== "t1") throw new Error("teacher context not resolved");
});

Deno.test("Role policy: admin role resolves admin context when no teacher mapping", async () => {
  const db = mockSupabaseClient(async ({ table, action }) => {
    if (table === "profiles" && action === "select") return { data: { role: "admin", is_active: true }, error: null };
    if (table === "teachers" && action === "select") return { data: [], error: null };
    return { data: null, error: null };
  });

  const ctx = await resolveAuthContext(req(), db as any, {
    createAuthClient: (() => ({ auth: { getUser: async () => ({ data: { user: mockAuthUser("admin", "u2") }, error: null }) } })) as any,
    withTimeoutFn: (p: Promise<any>) => p,
  });

  if (ctx.role !== "admin" || ctx.teacherMapped !== false) throw new Error("admin context not resolved");
});

Deno.test("Role policy: unknown role throws UNAUTHORIZED", async () => {
  const db = mockSupabaseClient(async ({ table, action }) => {
    if (table === "profiles" && action === "select") return { data: { role: "viewer", is_active: true }, error: null };
    return { data: null, error: null };
  });

  let code = "";
  try {
    await resolveAuthContext(req(), db as any, {
      createAuthClient: (() => ({ auth: { getUser: async () => ({ data: { user: mockAuthUser("viewer", "u3") }, error: null }) } })) as any,
      withTimeoutFn: (p: Promise<any>) => p,
    });
  } catch (e) {
    code = (e as ApiError).code;
  }
  if (code !== "UNAUTHORIZED") throw new Error(`expected UNAUTHORIZED got ${code}`);
});

Deno.test("Role policy: teacher without mapping throws INVALID_TEACHER_MAPPING", async () => {
  const db = mockSupabaseClient(async ({ table, action }) => {
    if (table === "profiles" && action === "select") return { data: { role: "teacher", is_active: true }, error: null };
    if (table === "teachers" && action === "select") return { data: [], error: null };
    return { data: null, error: null };
  });

  let code = "";
  try {
    await resolveAuthContext(req(), db as any, {
      createAuthClient: (() => ({ auth: { getUser: async () => ({ data: { user: mockAuthUser("teacher", "u4") }, error: null }) } })) as any,
      withTimeoutFn: (p: Promise<any>) => p,
    });
  } catch (e) {
    code = (e as ApiError).code;
  }
  if (code !== "INVALID_TEACHER_MAPPING") throw new Error(`expected INVALID_TEACHER_MAPPING got ${code}`);
});
