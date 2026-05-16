import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getTeacherAssignmentsAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const teacherId = auth.teacher.teacherId;
      const teacherEmail = auth.teacher.email;

      const { data, error } = await withTimeout(
        db
          .from("teacher_assignments")
          .select("*")
          .or(`teacher_id.eq.${teacherId},teacher_email.eq.${teacherEmail}`)
          .limit(500),
        "fetch teacher assignments",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load teacher assignments", 500);

      return json({ ok: true, data: data || [] });
    }