import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";

const MILESTONE_DEFAULTS: Record<string, Array<{ milestoneId: string; question: string }>> = {
  Class1: [{ milestoneId: "class1_attended", question: "Attended and engaged in Class 1?" }],
  Class2: [{ milestoneId: "class2_reflection", question: "Submitted Class 2 reflection?" }],
  Class3: [{ milestoneId: "class3_prayer", question: "Participated in prayer activity?" }],
  Class4A: [{ milestoneId: "class4a_checkpoint", question: "Completed Class 4A checkpoint?" }],
  Class4B: [{ milestoneId: "class4b_checkpoint", question: "Completed Class 4B checkpoint?" }],
  Class5: [{ milestoneId: "class5_checkpoint", question: "Completed Class 5 checkpoint?" }],
  Class6: [{ milestoneId: "class6_checkpoint", question: "Completed Class 6 checkpoint?" }],
  Class7: [{ milestoneId: "class7_checkpoint", question: "Completed Class 7 checkpoint?" }],
};

export async function getMilestonesForSessionAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const classSession = String(params.classSession || "Class1");
      return json({ ok: true, data: MILESTONE_DEFAULTS[classSession] || MILESTONE_DEFAULTS.Class1 });
    }