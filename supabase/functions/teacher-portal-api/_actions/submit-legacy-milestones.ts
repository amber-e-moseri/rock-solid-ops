import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function submitLegacyMilestonesAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const milestoneRows = Array.isArray(params.milestoneRows) ? params.milestoneRows : [];
      if (!milestoneRows.length) throw new ApiError("INVALID_PAYLOAD", "No milestone rows provided", 400);

      // Validate that all milestone rows belong to this teacher's class
      const applicantIds = milestoneRows.map((r) => String(r.applicant_id || "")).filter(Boolean);
      if (applicantIds.length) {
        const validApplicantsRes = await withTimeout(
          db
            .from("applicants")
            .select("id")
            .in("id", applicantIds)
            .eq("class_option_id", classOptionId),
          "validate milestone applicants",
        );
        if (validApplicantsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to validate applicants", 500);

        const validIds = new Set((validApplicantsRes.data || []).map((a) => String(a.id)));
        const invalidIds = applicantIds.filter((id) => !validIds.has(id));
        if (invalidIds.length) {
          await writeAudit(db, {
            action: "UNAUTHORIZED_CLASS_ACCESS",
            actorEmail: auth.teacher.email,
            actorId: auth.user.id,
            entityType: "student_milestones",
            entityId: classOptionId,
            status: "denied",
            details: { invalidApplicantIds: invalidIds },
          });
          throw new ApiError("UNAUTHORIZED_CLASS_ACCESS", "One or more milestone records are for applicants not in your class", 403);
        }
      }

      const { error: mErr } = await withTimeout(
        db.from("student_milestones").upsert(milestoneRows, { onConflict: "applicant_id,milestone_id" }),
        "upsert legacy milestones",
      );
      if (mErr) throw new ApiError("INTERNAL_ERROR", "Failed to save milestones", 500);

      await writeAudit(db, {
        action: "LEGACY_MILESTONES_SUBMITTED",
        actorEmail: auth.teacher.email,
        actorId: auth.user.id,
        entityType: "class_options",
        entityId: classOptionId,
        status: "ok",
        details: { upserted: milestoneRows.length },
      });

      const auditRows = milestoneRows.map((r) => ({
        action: "MILESTONE_UPDATED",
        actor_email: auth.teacher.email,
        actor_id: auth.user.id,
        entity_type: "student_milestones",
        entity_id: `${r.applicant_id}::${r.milestone_id}`,
        status: "ok",
        details: { class_option_id: classOptionId },
        logged_at: new Date().toISOString(),
      }));

      try {
        await db.from("audit_logs").insert(auditRows);
      } catch {
        // Best-effort audit logging
      }

      return json({ ok: true, data: { upserted: milestoneRows.length } });

}
