import { ApiError } from "./errors.ts";
import { withTimeout } from "./http.ts";
import { writeAudit } from "./teacher-auth.ts";

export async function assertClassOwnership(
  db: any,
  classOptionId: string,
  teacherId: string,
  actor: { email: string; userId: string },
) {
  if (!classOptionId) throw new ApiError("INVALID_PAYLOAD", "classOptionId is required", 400);

  const ownedClass = await withTimeout(
    db
      .from("class_options")
      .select("class_option_id,teacher_id,active,deleted_at")
      .eq("class_option_id", classOptionId)
      .maybeSingle(),
    "class ownership lookup",
  );

  if (
    ownedClass.error ||
    !ownedClass.data ||
    String(ownedClass.data.teacher_id || "") !== teacherId ||
    ownedClass.data.active !== true ||
    ownedClass.data.deleted_at
  ) {
    await writeAudit(db, {
      action: "UNAUTHORIZED_CLASS_ACCESS",
      actorEmail: actor.email,
      actorId: actor.userId,
      entityType: "class_options",
      entityId: classOptionId,
      status: "denied",
      details: { reason: ownedClass.error?.message || "Ownership/active check failed" },
    });
    throw new ApiError("UNAUTHORIZED_CLASS_ACCESS", "You are not authorized for this class", 403);
  }

  return ownedClass.data;
}
