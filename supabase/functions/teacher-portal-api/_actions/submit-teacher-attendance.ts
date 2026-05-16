import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function submitTeacherAttendanceAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const classSession = String(params.classSession || "").trim();
      const classDate = parseDate(params.classDate);
      const records = Array.isArray(params.records) ? params.records : [];

      const classSessions = classSession
        .split(",")
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      if (!classSessions.length) throw new ApiError("INVALID_PAYLOAD", "classSession is required", 400);

      const eligibleRecords = records.filter((r) => r && r.studentId);
      const allStudentIds = [...new Set(eligibleRecords.map((r) => String(r.studentId)))];
      const presentStudentIds = eligibleRecords
        .filter((r) => String(r.attendanceStatus || "").toLowerCase() === "present")
        .map((r) => String(r.studentId));

      const rosterMetaByStudentId = new Map<string, { group_id: string | null; subgroup_id: string | null; batch_id: string | null }>();
      if (allStudentIds.length) {
        const validStudentsRes = await withTimeout(
          db
            .from("class_roster")
            .select("student_id,class_option_id,status,group_id,subgroup_id,batch_id")
            .in("student_id", allStudentIds)
            .eq("class_option_id", classOptionId)
            .eq("status", "Active"),
          "validate students for attendance",
        );
        if (validStudentsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to validate students", 500);

        for (const row of validStudentsRes.data || []) {
          rosterMetaByStudentId.set(String(row.student_id), {
            group_id: row.group_id ?? null,
            subgroup_id: row.subgroup_id ?? null,
            batch_id: row.batch_id ?? null,
          });
        }

        const validIds = new Set((validStudentsRes.data || []).map((s) => String(s.student_id)));
        const invalidIds = allStudentIds.filter((id) => !validIds.has(id));
        if (invalidIds.length) {
          await writeAudit(db, {
            action: "UNAUTHORIZED_CLASS_ACCESS",
            actorEmail: auth.teacher.email,
            actorId: auth.user.id,
            entityType: "attendance_log",
            entityId: classOptionId,
            status: "denied",
            details: { invalidStudentIds: invalidIds },
          });
          throw new ApiError("UNAUTHORIZED_CLASS_ACCESS", "One or more students are not in your class roster", 403);
        }
      }

      const nowIso = new Date().toISOString();
      const inserts = presentStudentIds.flatMap((studentId) =>
        classSessions.map((session) => ({
          student_id: studentId,
          // Source group/subgroup/batch from class_roster metadata; keep null if unavailable.
          group_id: rosterMetaByStudentId.get(studentId)?.group_id ?? null,
          subgroup_id: rosterMetaByStudentId.get(studentId)?.subgroup_id ?? null,
          batch_id: rosterMetaByStudentId.get(studentId)?.batch_id ?? null,
          class_option_id: classOptionId || null,
          teacher_name: auth.teacher.fullName || null,
          class_number: session,
          class_date: classDate,
          present: true,
          submitted_by_teacher: true,
          submission_date: nowIso,
        })),
      );

      const dedupe = new Map<string, typeof inserts[number]>();
      for (const row of inserts) {
        // attendance_log dedupe key aligns with DB upsert conflict key.
        const key = `${row.student_id}::${row.class_option_id}::${row.class_number}::${row.class_date || ""}`;
        if (!dedupe.has(key)) dedupe.set(key, row);
      }
      const uniqueInserts = [...dedupe.values()];

      if (uniqueInserts.length) {
        const upsertRes = await withTimeout(
          db.from("attendance_log").upsert(uniqueInserts, {
            onConflict: "student_id,class_option_id,class_number,class_date",
          }),
          "attendance upsert",
        );
        if (upsertRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to save attendance", 500);
      }

      await writeAudit(db, {
        action: "ATTENDANCE_SUBMITTED",
        actorEmail: auth.teacher.email,
        actorId: auth.user.id,
        entityType: "class_options",
        entityId: classOptionId,
        status: "ok",
        details: {
          inserted: uniqueInserts.length,
          presentStudents: presentStudentIds.length,
          sessions: classSessions,
          classDate,
        },
      });

      return json({ ok: true, data: { inserted: uniqueInserts.length } });
    }