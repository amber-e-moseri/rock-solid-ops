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

      const attendanceCountRes = await withTimeout(
        db
          .from("attendance_log")
          .select("attendance_id", { count: "exact", head: true })
          .eq("class_option_id", classOptionId),
        "detect first attendance submission",
      );
      if (attendanceCountRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to detect class submission history", 500);
      const isFirstSubmission = Number(attendanceCountRes.count || 0) === 0;

      let confirmedStartDate: string | null = null;
      const classMetaRes = await withTimeout(
        db
          .from("class_options")
          .select("class_option_id,confirmed_start_date")
          .eq("class_option_id", classOptionId)
          .maybeSingle(),
        "load class metadata for first submission",
      );
      if (classMetaRes.error) {
        const isMissingConfirmedStartColumn = String(classMetaRes.error?.code || "") === "42703" ||
          String(classMetaRes.error?.message || "").toLowerCase().includes("confirmed_start_date");
        if (!isMissingConfirmedStartColumn) {
          throw new ApiError("INTERNAL_ERROR", "Failed to load class metadata", 500);
        }
        const classMetaFallbackRes = await withTimeout(
          db
            .from("class_options")
            .select("class_option_id")
            .eq("class_option_id", classOptionId)
            .maybeSingle(),
          "load class metadata fallback for first submission",
        );
        if (classMetaFallbackRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load class metadata", 500);
      } else {
        confirmedStartDate = classMetaRes.data?.confirmed_start_date || null;
      }

      const slotRes = await withTimeout(
        db
          .from("class_slots")
          .select("batch_id,status,batches(batch_id,start_date,active,status)")
          .eq("class_option_id", classOptionId)
          .order("created_at", { ascending: false })
          .limit(10),
        "load class slot batch metadata",
      );
      if (slotRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load class slot metadata", 500);
      const activeSlot = (slotRes.data || []).find((row: any) => {
        const batch = Array.isArray(row.batches) ? row.batches[0] : row.batches;
        const batchActive = batch?.active === true || String(batch?.status || "").toUpperCase() === "ACTIVE";
        const slotActive = String(row.status || "").toUpperCase() === "ACTIVE" || !row.status;
        return batchActive && slotActive && String(batch?.start_date || "").trim();
      });
      const activeBatch = activeSlot ? (Array.isArray(activeSlot.batches) ? activeSlot.batches[0] : activeSlot.batches) : null;

      const { data: fellowships } = await withTimeout(
        db.from("fellowship_map").select("fellowship_code,campus_name").eq("active", true).order("campus_name"),
        "fetch fellowships",
      );

      return json({
        ok: true,
        data: {
          roster,
          fellowships: (fellowships || []).map((f) => ({ code: f.fellowship_code, name: f.campus_name })),
          batchId: activeBatch?.batch_id || null,
          batchStartDate: activeBatch?.start_date || null,
          alreadySubmitted: false,
          previousSubmissionSummary: "",
          firstSubmissionRequired: isFirstSubmission,
          firstSubmissionMeta: {
            classOptionId,
            confirmedStartDate,
            batchId: activeBatch?.batch_id || null,
            batchStartDate: activeBatch?.start_date || null,
          },
        },
      });
    }
