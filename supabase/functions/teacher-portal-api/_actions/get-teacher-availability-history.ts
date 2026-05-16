import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getTeacherAvailabilityHistoryAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      if (!auth?.teacher?.teacherId) {
        return json({ ok: true, data: [] });
      }
      const { data, error } = await withTimeout(
        db
          .from("teacher_availability")
          .select("*")
          .eq("teacher_id", auth.teacher.teacherId)
          .order("created_at", { ascending: false })
          .limit(300),
        "fetch availability history",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load availability history", 500);

      return json({ ok: true, data: data || [] });
    }
