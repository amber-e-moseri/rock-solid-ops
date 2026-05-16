import { ApiError } from "../_lib/errors.ts";
import { json, normalizeTimeSlot, parseDate, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";
import { safeLogAudit, writeAudit } from "../_lib/teacher-auth.ts";


export async function getTeacherCampusOptionsAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
      const { data, error } = await withTimeout(
        db
          .from("fellowship_map")
          .select("subgroup_id,campus_name")
          .eq("active", true)
          .not("subgroup_id", "is", null)
          .limit(500),
        "fetch campus options",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load campus options", 500);

      const uniq = new Map<string, { code: string; campusName: string }>();
      (data || []).forEach((r) => {
        const code = String(r.subgroup_id || "").trim();
        const campusName = String(r.campus_name || "").trim();
        if (!code) return;
        if (!uniq.has(code)) uniq.set(code, { code, campusName: campusName || code });
      });

      const rows = [...uniq.values()];
      if (!rows.length) {
        rows.push({ code: "GENERAL", campusName: "General Fellowship" });
      }

      return json({ ok: true, data: rows });
    }
