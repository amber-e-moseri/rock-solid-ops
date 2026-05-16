import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ApiError } from "./errors.ts";
import { safeLower, withTimeout } from "./http.ts";
import type { WriteAuditInput } from "./types.ts";

function getBearerToken(req: Request): string {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new ApiError("UNAUTHORIZED", "Missing or invalid bearer token", 401);
  return match[1].trim();
}

export async function writeAudit(db: any, input: WriteAuditInput) {
  const payload = {
    action: input.action,
    actor_email: input.actorEmail || null,
    actor_id: input.actorId || null,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    status: input.status || null,
    details: input.details || {},
    logged_at: new Date().toISOString(),
  };

  try {
    await db.from("audit_logs").insert(payload);
  } catch {
    // Best-effort audit logging only.
  }
}

export async function safeLogAudit(db: any, input: WriteAuditInput) {
  await writeAudit(db, input);
}

export async function resolveAuthContext(req: Request, dbService: any) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const token = getBearerToken(req);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const userRes = await withTimeout(authClient.auth.getUser(), "auth.getUser");
  if (userRes.error || !userRes.data?.user) {
    throw new ApiError("UNAUTHORIZED", "Session is invalid or expired", 401);
  }

  const user = userRes.data.user;
  const email = safeLower(user.email);
  if (!email) throw new ApiError("INVALID_TEACHER_MAPPING", "Authenticated user email is missing", 403);

  const profileRes = await withTimeout(
    dbService
      .from("profiles")
      .select("role,is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
    "resolve profile role",
  );
  const profileRole = safeLower(profileRes.data?.role);
  const profileActive = profileRes.data?.is_active !== false;
  const allowedRoles = new Set(["teacher", "admin", "superadmin", "subgroup_admin", "pastor", "principal"]);
  if (!profileRes.data || !profileActive || !allowedRoles.has(profileRole)) {
    await writeAudit(dbService, {
      action: "TEACHER_ACCESS_DENIED",
      actorId: user.id,
      actorEmail: email,
      status: "UNAUTHORIZED",
      details: {
        reason: "Profile role not allowed",
        role: profileRole || null,
        profile_active: profileRes.data?.is_active ?? null,
      },
    });
    throw new ApiError("UNAUTHORIZED", "Forbidden", 403);
  }

  const teacherRes = await withTimeout(
    dbService
      .from("teachers")
      .select("teacher_id,full_name,email,active,status,deleted_at")
      .ilike("email", email)
      .limit(1)
      .maybeSingle(),
    "resolve teacher mapping",
  );

  if (teacherRes.error || !teacherRes.data) {
    console.error("[INVALID_TEACHER_MAPPING]", { looked_up_email: email, db_error: teacherRes.error?.message ?? null });
    await writeAudit(dbService, {
      action: "TEACHER_ACCESS_DENIED",
      actorId: user.id,
      actorEmail: email,
      status: "INVALID_TEACHER_MAPPING",
      details: { reason: teacherRes.error?.message || "No teacher row found" },
    });
    throw new ApiError("INVALID_TEACHER_MAPPING", "No teacher record is mapped to this account. Ask an admin to link your email to a teacher record.", 403);
  }

  const teacher = teacherRes.data;
  const teacherStatus = String(teacher.status || "").trim().toUpperCase();
  if (
    teacher.deleted_at ||
    teacher.active === false ||
    (teacherStatus && teacherStatus !== "ACTIVE")
  ) {
    await writeAudit(dbService, {
      action: "TEACHER_ACCESS_DENIED",
      actorId: user.id,
      actorEmail: email,
      entityType: "teacher",
      entityId: teacher.teacher_id,
      status: "TEACHER_NOT_ACTIVE",
      details: { status: teacherStatus || null, active: teacher.active ?? null },
    });
    throw new ApiError("TEACHER_NOT_ACTIVE", "Teacher account is inactive", 403);
  }

  return {
    user,
    teacher: {
      teacherId: String(teacher.teacher_id),
      fullName: String(teacher.full_name || ""),
      email,
    },
  };
}
