import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getTeacherActiveClassOptionsAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const teacherId = auth.teacher.teacherId;
      const { data, error } = await withTimeout(
        db
          .from("class_options")
          .select("class_option_id,teacher_id,day,class_time,fellowship_codes,active,enrollment_open,deleted_at")
          .eq("teacher_id", teacherId)
          .eq("active", true)
          .eq("enrollment_open", true)
          .is("deleted_at", null)
          .order("day")
          .order("class_time"),
        "fetch teacher classes",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load classes", 500);

      const mapRows = await withTimeout(
        db.from("fellowship_map").select("fellowship_code,campus_name"),
        "fetch fellowship map",
      );
      const campusByCode = new Map((mapRows.data || []).map((x) => [x.fellowship_code, x.campus_name]));
      const rows = (data || []).map((r) => {
        const codes = Array.isArray(r.fellowship_codes) ? r.fellowship_codes : [];
        const first = String(codes[0] || "");
        const campus = campusByCode.get(first) || first || "Campus";
        const t = String(r.class_time || "00:00:00");
        const [hh, mm] = t.slice(0, 5).split(":").map(Number);
        const ap = hh >= 12 ? "PM" : "AM";
        const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
        return {
          classOptionId: r.class_option_id,
          campus,
          fellowship: first,
          day: r.day || "",
          time: `${h12}:${String(mm || 0).padStart(2, "0")} ${ap}`,
          batch: "",
          enrolledCount: 0,
        };
      });
      return json({ ok: true, data: rows });
}
