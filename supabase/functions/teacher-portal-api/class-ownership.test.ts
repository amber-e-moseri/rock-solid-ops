import { assertClassOwnership } from "./_lib/class-ownership.ts";
import { ApiError } from "./_lib/errors.ts";
import { mockSupabaseClient } from "../_shared/test-utils.ts";

const actor = { email: "teacher@example.com", userId: "u1" };

Deno.test("Class ownership: passes when teacher owns active class", async () => {
  const db = mockSupabaseClient(async () => ({ data: { class_option_id: "c1", teacher_id: "t1", active: true, deleted_at: null }, error: null }));
  const row = await assertClassOwnership(db as any, "c1", "t1", actor);
  if (row.class_option_id !== "c1") throw new Error("ownership should pass");
});

Deno.test("Class ownership: throws 403 when class owned by another teacher", async () => {
  const db = mockSupabaseClient(async () => ({ data: { class_option_id: "c1", teacher_id: "other", active: true, deleted_at: null }, error: null }));
  let status = 0;
  try { await assertClassOwnership(db as any, "c1", "t1", actor); } catch (e) { status = (e as ApiError).status; }
  if (status !== 403) throw new Error(`expected 403 got ${status}`);
});

Deno.test("Class ownership: throws 400 when classOptionId is empty", async () => {
  const db = mockSupabaseClient(async () => ({ data: null, error: null }));
  let status = 0;
  try { await assertClassOwnership(db as any, "", "t1", actor); } catch (e) { status = (e as ApiError).status; }
  if (status !== 400) throw new Error(`expected 400 got ${status}`);
});

Deno.test("Class ownership: throws 403 when class is inactive", async () => {
  const db = mockSupabaseClient(async () => ({ data: { class_option_id: "c1", teacher_id: "t1", active: false, deleted_at: null }, error: null }));
  let status = 0;
  try { await assertClassOwnership(db as any, "c1", "t1", actor); } catch (e) { status = (e as ApiError).status; }
  if (status !== 403) throw new Error(`expected 403 got ${status}`);
});
