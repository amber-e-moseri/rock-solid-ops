import { ApiError } from "../_lib/errors.ts";
import { json, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";

export async function updateStudentMilestoneAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
  const studentId = String(params.studentId || "").trim();
  const milestoneCode = String(params.milestoneCode || "").trim();
  const completed = Boolean(params.completed);

  if (!studentId || !milestoneCode) {
    throw new ApiError("INVALID_PAYLOAD", "studentId and milestoneCode are required", 400);
  }

  const studentRes = await withTimeout(
    db
      .from("students")
      .select("student_id,class_option_id")
      .eq("student_id", studentId)
      .is("deleted_at", null)
      .maybeSingle(),
    "lookup student class ownership",
  );
  if (studentRes.error || !studentRes.data?.class_option_id) {
    throw new ApiError("INVALID_PAYLOAD", "Student not found or not assigned to a class", 404);
  }

  await assertClassOwnership(
    db,
    String(studentRes.data.class_option_id),
    auth.teacher.teacherId,
    { email: auth.teacher.email, userId: auth.user.id },
  );

  if (completed) {
    const updateRes = await withTimeout(
      db
        .from("student_milestone_status")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: auth.teacher.email,
          updated_at: new Date().toISOString(),
          updated_by: auth.teacher.email,
        })
        .eq("student_id", studentId)
        .eq("milestone_code", milestoneCode)
        .select("id")
        .limit(1),
      "update milestone as completed",
    );
    if (updateRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to update milestone status", 500);

    if (!updateRes.data || updateRes.data.length === 0) {
      const insertRes = await withTimeout(
        db
          .from("student_milestone_status")
          .insert({
            student_id: studentId,
            applicant_id: studentId,
            milestone_code: milestoneCode,
            status: "completed",
            completed_at: new Date().toISOString(),
            completed_by: auth.teacher.email,
            updated_at: new Date().toISOString(),
            updated_by: auth.teacher.email,
          }),
        "insert completed milestone status",
      );
      if (insertRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to insert milestone status", 500);
    }
  } else {
    const incompleteRes = await withTimeout(
      db
        .from("student_milestone_status")
        .update({
          status: "incomplete",
          updated_at: new Date().toISOString(),
          updated_by: auth.teacher.email,
        })
        .eq("student_id", studentId)
        .eq("milestone_code", milestoneCode),
      "update milestone as incomplete",
    );
    if (incompleteRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to clear milestone status", 500);
  }

  return json({ ok: true });
}

