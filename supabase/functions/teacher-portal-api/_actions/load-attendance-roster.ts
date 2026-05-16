import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function loadAttendanceRosterAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const { data, error } = await withTimeout(
        db
          .from("class_roster")
          .select("student_id,class_option_id,status,students(student_id,full_name,email,phone,fellowship_code,status,class_option_id)")
          .eq("class_option_id", classOptionId)
          .eq("status", "Active")
          .order("created_at"),
        "fetch attendance roster",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load roster", 500);

      const roster = (data || [])
        .map((row) => {
          const s = Array.isArray(row.students) ? row.students[0] : row.students;
          if (!s?.student_id) return null;
          return {
            id: s.student_id,
            studentId: s.student_id,
            applicantId: "",
            personType: "Student",
            fullName: s.full_name || "",
            email: s.email || "",
            phone: s.phone || "",
            fellowshipCode: s.fellowship_code || "",
            sourceClassOptionId: row.class_option_id || classOptionId,
            sourceSession: "",
            source: "class_roster",
            status: s.status || row.status || "Active",
          };
        })
        .filter(Boolean);

      const { data: fellowships } = await withTimeout(
        db.from("fellowship_map").select("fellowship_code,campus_name").eq("active", true).order("campus_name"),
        "fetch fellowships",
      );

      return json({
        ok: true,
        data: {
          roster,
          fellowships: (fellowships || []).map((f) => ({ code: f.fellowship_code, name: f.campus_name })),
          alreadySubmitted: false,
          previousSubmissionSummary: "",
        },
      });
    }