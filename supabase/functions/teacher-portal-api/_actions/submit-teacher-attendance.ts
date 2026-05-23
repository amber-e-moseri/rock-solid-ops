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
      const firstSubmissionMeta = params.firstSubmissionMeta && typeof params.firstSubmissionMeta === "object"
        ? params.firstSubmissionMeta
        : null;

      const eligibleRecords = records.filter((r) => r && r.studentId);
      const allStudentIdsFromPayload = Array.isArray(params.allStudentIds) ? params.allStudentIds : [];
      const allStudentIds = [...new Set(
        (allStudentIdsFromPayload.length ? allStudentIdsFromPayload : eligibleRecords.map((r) => r.studentId))
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      )];
      const presentStudentIds = eligibleRecords
        .filter((r) => String(r.attendanceStatus || "").toLowerCase() === "present")
        .map((r) => String(r.studentId));
      const presentStudentSet = new Set(presentStudentIds);
      const notesByStudentId = new Map<string, string | null>();
      for (const r of eligibleRecords) {
        notesByStudentId.set(String(r.studentId), String(r.notes || "").trim() || null);
      }

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
      const attendanceCountRes = await withTimeout(
        db
          .from("attendance_log")
          .select("attendance_id", { count: "exact", head: true })
          .eq("class_option_id", classOptionId),
        "first submission detection",
      );
      if (attendanceCountRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to detect first submission state", 500);
      const isFirstSubmission = Number(attendanceCountRes.count || 0) === 0;

      const parseYmd = (raw: unknown): string | null => {
        const v = String(raw || "").trim();
        if (!v) return null;
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
      };
      const dateDiffDays = (fromYmd: string, toYmd: string): number => {
        const from = new Date(`${fromYmd}T00:00:00Z`);
        const to = new Date(`${toYmd}T00:00:00Z`);
        return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
      };
      const plusDays = (ymd: string, days: number): string => {
        const d = new Date(`${ymd}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
      };

      if (isFirstSubmission) {
        const startDateCandidate = firstSubmissionMeta?.actualStartDate ?? params.classDate;
        const startDate = parseYmd(startDateCandidate);
        if (!startDate) {
          throw new ApiError("INVALID_PAYLOAD", "A valid classDate is required for first submission.", 400);
        }

        const activeSlotRes = await withTimeout(
          db
            .from("class_slots")
            .select("batch_id,status,batches(batch_id,start_date,active,status)")
            .eq("class_option_id", classOptionId)
            .order("created_at", { ascending: false })
            .limit(10),
          "resolve class batch for late start",
        );
        if (activeSlotRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to resolve class batch", 500);
        const activeSlot = (activeSlotRes.data || []).find((row: any) => {
          const batch = Array.isArray(row.batches) ? row.batches[0] : row.batches;
          const batchActive = batch?.active === true || String(batch?.status || "").toUpperCase() === "ACTIVE";
          const slotActive = String(row.status || "").toUpperCase() === "ACTIVE" || !row.status;
          return batchActive && slotActive && String(batch?.start_date || "").trim();
        });
        const batchRef = activeSlot ? (Array.isArray(activeSlot.batches) ? activeSlot.batches[0] : activeSlot.batches) : null;
        const batchStartDate = String(batchRef?.start_date || "").trim();
        if (!batchStartDate) {
          throw new ApiError("INVALID_PAYLOAD", "Unable to determine active batch start date for this class.", 400);
        }

        if (startDate < batchStartDate) {
          throw new ApiError("INVALID_PAYLOAD", "Actual class start date cannot be before batch start date.", 400);
        }
        if (classDate && startDate > classDate) {
          throw new ApiError("INVALID_PAYLOAD", "Actual class start date cannot be after the submitted class date.", 400);
        }

        const confirmedStartRes = await withTimeout(
          db
            .from("class_options")
            .update({
              confirmed_start_date: startDate,
              updated_at: nowIso,
              updated_by: auth.teacher.email,
            })
            .eq("class_option_id", classOptionId),
          "save confirmed class start date",
        );
        if (confirmedStartRes.error) {
          const isMissingConfirmedStartColumn = String(confirmedStartRes.error?.code || "") === "42703" ||
            String(confirmedStartRes.error?.message || "").toLowerCase().includes("confirmed_start_date");
          if (!isMissingConfirmedStartColumn) {
            throw new ApiError("INTERNAL_ERROR", "Failed to save confirmed class start date", 500);
          }
          const fallbackUpdateRes = await withTimeout(
            db
              .from("class_options")
              .update({
                updated_at: nowIso,
                updated_by: auth.teacher.email,
              })
              .eq("class_option_id", classOptionId),
            "save class metadata fallback",
          );
          if (fallbackUpdateRes.error) {
            throw new ApiError("INTERNAL_ERROR", "Failed to save class metadata fallback", 500);
          }
        }

        const missedWeeks = Math.max(0, Math.floor(dateDiffDays(batchStartDate, startDate) / 7));
        if (missedWeeks > 0 && allStudentIds.length > 0) {
          const lateRows = allStudentIds.flatMap((studentId) => {
            const meta = rosterMetaByStudentId.get(studentId);
            return Array.from({ length: missedWeeks }).map((_, idx) => ({
              student_id: studentId,
              group_id: meta?.group_id ?? null,
              subgroup_id: meta?.subgroup_id ?? null,
              batch_id: meta?.batch_id ?? batchRef?.batch_id ?? null,
              class_option_id: classOptionId || null,
              teacher_name: auth.teacher.fullName || null,
              class_number: String(idx + 1),
              class_date: plusDays(batchStartDate, idx * 7),
              present: false,
              submitted_by_teacher: true,
              submission_date: nowIso,
              session_status: "LATE_START",
              response_id: "Late start - confirmed by teacher",
            }));
          });
          if (lateRows.length) {
            const lateUpsertRes = await withTimeout(
              db.from("attendance_log").upsert(lateRows, {
                onConflict: "student_id,class_option_id,class_number,class_date",
              }),
              "late start backfill upsert",
            );
            if (lateUpsertRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to save late-start attendance history", 500);
          }
        }
      }

      const inserts = allStudentIds.flatMap((studentId) =>
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
          present: presentStudentSet.has(studentId),
          notes: notesByStudentId.get(studentId) ?? null,
          submitted_by_teacher: true,
          submission_date: nowIso,
          session_status: "SUBMITTED",
          updated_at: nowIso,
        })),
      );

      const dedupe = new Map<string, typeof inserts[number]>();
      for (const row of inserts) {
        // attendance_log dedupe key aligns with DB upsert conflict key.
        const key = `${row.student_id}::${row.class_option_id}::${row.class_number}::${row.batch_id || ""}`;
        if (!dedupe.has(key)) dedupe.set(key, row);
      }
      const uniqueInserts = [...dedupe.values()];

      if (uniqueInserts.length) {
        const upsertRes = await withTimeout(
          db.from("attendance_log").upsert(uniqueInserts, {
            onConflict: "student_id,class_option_id,class_number,batch_id",
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
