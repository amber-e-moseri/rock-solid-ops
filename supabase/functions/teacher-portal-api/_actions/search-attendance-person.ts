import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function searchAttendancePersonAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const query = String(params.query || "").trim().toLowerCase();
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const studentsRes = await withTimeout(
        db
          .from("students")
          .select("student_id,full_name,email,fellowship_code,class_option_id,status")
          .eq("class_option_id", classOptionId)
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .is("deleted_at", null)
          .limit(25),
        "search students",
      );
      if (studentsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to search students", 500);

      const applicantsRes = await withTimeout(
        db
          .from("applicants")
          .select("id,first_name,last_name,email,fellowship_code,class_option_id,status")
          .eq("class_option_id", classOptionId)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(25),
        "search applicants",
      );
      if (applicantsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to search applicants", 500);

      const rows = [
        ...(studentsRes.data || []).map((s) => ({
          id: s.student_id,
          studentId: s.student_id,
          applicantId: "",
          fullName: s.full_name || "",
          email: s.email || "",
          fellowshipCode: s.fellowship_code || "",
          classOptionId: s.class_option_id || "",
          sourceClassOptionId: s.class_option_id || classOptionId,
          personType: "Student",
          status: s.status || "",
        })),
        ...(applicantsRes.data || []).map((a) => ({
          id: `APP-${a.id}`,
          studentId: "",
          applicantId: a.id,
          fullName: `${a.first_name || ""} ${a.last_name || ""}`.trim(),
          email: a.email || "",
          fellowshipCode: a.fellowship_code || "",
          classOptionId: a.class_option_id || "",
          sourceClassOptionId: a.class_option_id || classOptionId,
          personType: "Applicant",
          status: a.status || "",
        })),
      ];
      return json({ ok: true, data: rows });
    }