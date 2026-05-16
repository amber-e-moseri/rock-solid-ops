import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getApplicantsForClassAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const { data, error } = await withTimeout(
        db
          .from("applicants")
          .select("*")
          .eq("class_option_id", classOptionId)
          .limit(5000),
        "fetch applicants for class",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load applicants", 500);

      return json({ ok: true, data: data || [] });
    }