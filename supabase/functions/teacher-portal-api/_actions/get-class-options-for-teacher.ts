import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getClassOptionsForTeacherAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const teacherId = auth.teacher.teacherId;

      const { data, error } = await withTimeout(
        db
          .from("class_options")
          .select("*")
          .eq("teacher_id", teacherId)
          .limit(1000),
        "fetch class options for teacher",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load class options", 500);

      return json({ ok: true, data: data || [] });
    }