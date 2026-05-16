import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function submitTeacherAvailabilityAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const slots = Array.isArray(params.slots) ? params.slots : [];
      if (!slots.length) throw new ApiError("INVALID_PAYLOAD", "No slots provided", 400);

      const inserts = slots.map((s) => ({
        teacher_id: auth.teacher.teacherId,
        day: String(s.teacherDay || s.day || "").trim(),
        time_slot: normalizeTimeSlot(s.timeSlot || s.time),
        status: "Pending",
        notes: String(s.notes || "Teacher portal submission").slice(0, 300),
        created_by: auth.teacher.email,
        updated_by: auth.teacher.email,
      })).filter((s) => s.day && s.time_slot);

      if (!inserts.length) throw new ApiError("INVALID_PAYLOAD", "No valid availability slots", 400);

      const insertRes = await withTimeout(db.from("teacher_availability").insert(inserts), "insert availability");
      if (insertRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to save availability", 500);

      await writeAudit(db, {
        action: "AVAILABILITY_UPDATED",
        actorEmail: auth.teacher.email,
        actorId: auth.user.id,
        entityType: "teacher_availability",
        entityId: auth.teacher.teacherId,
        status: "ok",
        details: { inserted: inserts.length },
      });

      return json({ ok: true, data: { inserted: inserts.length } });
    }