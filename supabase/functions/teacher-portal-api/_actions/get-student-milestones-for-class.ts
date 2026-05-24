import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getStudentMilestonesForClassAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
  const classOptionId = String(params.classOptionId || "").trim();
  await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

  const { data: applicants, error: applicantsError } = await withTimeout(
    db
      .from("applicants")
      .select("id")
      .eq("class_option_id", classOptionId)
      .limit(5000),
    "fetch applicants for milestone lookup",
  );
  if (applicantsError) throw new ApiError("INTERNAL_ERROR", "Failed to resolve class applicants", 500);

  const applicantIds = (applicants || []).map((row: { id: string }) => String(row.id || "")).filter(Boolean);
  if (!applicantIds.length) return json({ ok: true, data: [] });

  const { data, error } = await withTimeout(
    db
      .from("student_milestone_status")
      .select("*")
      .in("applicant_id", applicantIds)
      .limit(10000),
    "fetch student milestones for class",
  );
  if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load student milestones", 500);

  return json({ ok: true, data: data || [] });
}
