import { assignApplicant } from "../../_shared/lib/assign-applicant.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export async function assignApplicantAdminAction(ctx: { db: any; auth: any; params: any }) {
  const { db, auth, params } = ctx;
  const applicantId = String(params?.applicant_id || "").trim();
  const classOptionId = String(params?.class_option_id || "").trim();
  const batchId = String(params?.batch_id || "").trim();
  const actorEmail = String(params?.actor_email || auth?.profile?.email || auth?.user?.email || "").trim() || undefined;

  if (!applicantId || !classOptionId || !batchId) {
    return json({ ok: false, error: "applicant_id, class_option_id, and batch_id are required" }, 400);
  }

  try {
    const result = await assignApplicant(applicantId, classOptionId, db, {
      batchId,
      triggeredBy: "admin",
      actorEmail,
    });

    return json({
      ok: true,
      studentId: result.studentId,
      registrationStatus: "ASSIGNED",
      classId: result.classId,
      batchId: result.batchId,
    });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message || err || "Assignment failed") }, 400);
  }
}
