import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getMilestoneDefinitionsAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const { data, error } = await withTimeout(
        db.from("milestone_definitions").select("*").limit(200),
        "fetch milestone definitions",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load milestone definitions", 500);

      return json({ ok: true, data: data || [] });
    }