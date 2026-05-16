import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function lookupTeacherForAttendanceAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
  const query = safeLower(params.query);
  const teacher = auth.teacher;
  const hay = `${safeLower(teacher.fullName)} ${safeLower(teacher.email)} ${safeLower(teacher.teacherId)}`;
  const matchesSelf = !query || hay.includes(query);
  if (matchesSelf) {
    return json({
      ok: true,
      data: [{ teacherId: teacher.teacherId, fullName: teacher.fullName, email: teacher.email, subGroupLabel: "" }],
    });
  }

  const profileRes = await withTimeout(
    db
      .from("profiles")
      .select("role")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    "lookup caller role",
  );
  const role = safeLower(profileRes.data?.role);
  const isAdmin = role === "admin" || role === "superadmin";
  if (!isAdmin) {
    return json({ ok: true, data: [] });
  }

  const q = `%${query}%`;
  const { data, error } = await withTimeout(
    db
      .from("teachers")
      .select("teacher_id,full_name,email")
      .or(`full_name.ilike.${q},email.ilike.${q},teacher_id.ilike.${q}`)
      .limit(10),
    "search teachers fallback",
  );
  if (error) throw new ApiError("INTERNAL_ERROR", "Failed to search teachers", 500);

  const rows = (data || []).map((row: any) => ({
    teacherId: String(row.teacher_id || ""),
    fullName: String(row.full_name || ""),
    email: String(row.email || ""),
    subGroupLabel: "",
  }));

  return json({ ok: true, data: rows });
}
