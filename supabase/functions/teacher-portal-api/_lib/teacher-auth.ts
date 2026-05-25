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

export async function resolveAuthContext(
  req: Request,
  dbService: any,
  deps?: {
    createAuthClient?: typeof createClient;
    withTimeoutFn?: typeof withTimeout;
  },
) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const token = getBearerToken(req);

  const createAuthClient = deps?.createAuthClient || createClient;
  const withTimeoutFn = deps?.withTimeoutFn || withTimeout;

  const authClient = createAuthClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const userRes = await withTimeoutFn(authClient.auth.getUser(), "auth.getUser");
  if (userRes.error || !userRes.data?.user) {
    throw new ApiError("UNAUTHORIZED", "Session is invalid or expired", 401);
  }

  const user = userRes.data.user;
  const email = safeLower(user.email);
  if (!email) throw new ApiError("INVALID_TEACHER_MAPPING", "Authenticated user email is missing", 403);

  const profileRes = await withTimeoutFn(
    dbService
      .from("profiles")
      .select("role,is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
    "resolve profile role",
  );
  const profileRole = safeLower(profileRes.data?.role);
  const profileActive = profileRes.data?.is_active !== false;
  const allowedRoles = new Set(["teacher", "admin", "superadmin", "subgroup_admin", "pastor", "principal", "regional_secretary"]);
  const adminLikeRoles = new Set(["admin", "superadmin", "subgroup_admin", "pastor", "principal", "regional_secretary"]);
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

  const linkedTeachersRes = await withTimeoutFn(
    dbService
      .from("teachers")
      .select("teacher_id,full_name,email,active,status,deleted_at,teacher_user_id")
      .eq("teacher_user_id", user.id)
      .limit(2),
    "resolve teacher mapping by teacher_user_id",
  );

  if (linkedTeachersRes.error) {
    throw new ApiError("INTERNAL_ERROR", linkedTeachersRes.error.message || "Failed to resolve teacher mapping", 500);
  }

  const linkedTeachers = linkedTeachersRes.data || [];
  if (linkedTeachers.length > 1) {
    await writeAudit(dbService, {
      action: "TEACHER_ACCESS_DENIED",
      actorId: user.id,
      actorEmail: email,
      status: "INVALID_TEACHER_MAPPING",
      details: { reason: "Multiple teachers linked to same auth user", count: linkedTeachers.length },
    });
    throw new ApiError("INVALID_TEACHER_MAPPING", "Multiple teacher records are linked to this account. Contact an admin.", 403);
  }

  let teacher = linkedTeachers[0] || null;

  if (!teacher) {
    const teacherRes = await withTimeoutFn(
      dbService
        .from("teachers")
        .select("teacher_id,full_name,email,active,status,deleted_at,teacher_user_id")
        .ilike("email", email)
        .is("teacher_user_id", null)
        .limit(2),
      "resolve teacher mapping legacy fallback",
    );
    if (teacherRes.error) {
      throw new ApiError("INTERNAL_ERROR", teacherRes.error.message || "Failed to resolve teacher mapping", 500);
    }
    const fallbackRows = teacherRes.data || [];
    if (fallbackRows.length === 1) {
      teacher = fallbackRows[0];
    } else if (fallbackRows.length > 1) {
      await writeAudit(dbService, {
        action: "TEACHER_ACCESS_DENIED",
        actorId: user.id,
        actorEmail: email,
        status: "INVALID_TEACHER_MAPPING",
        details: { reason: "Ambiguous legacy email fallback", email, count: fallbackRows.length },
      });
      throw new ApiError("INVALID_TEACHER_MAPPING", "Multiple teacher records match this email. Ask an admin to link your account explicitly.", 403);
    }
  }

  if (!teacher) {
    if (adminLikeRoles.has(profileRole)) {
      return {
        user,
        role: profileRole || "admin",
        teacherMapped: false,
        teacher: {
          teacherId: "",
          fullName: String(user.user_metadata?.full_name || user.email || "Admin"),
          email,
        },
      };
    }
    console.error("[INVALID_TEACHER_MAPPING]", { looked_up_email: email, db_error: null });
    await writeAudit(dbService, {
      action: "TEACHER_ACCESS_DENIED",
      actorId: user.id,
      actorEmail: email,
      status: "INVALID_TEACHER_MAPPING",
      details: { reason: "No teacher row found" },
    });
    throw new ApiError("INVALID_TEACHER_MAPPING", "No teacher record is mapped to this account. Ask an admin to link your email to a teacher record.", 403);
  }
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
    role: profileRole || "teacher",
    teacherMapped: true,
    teacher: {
      teacherId: String(teacher.teacher_id),
      fullName: String(teacher.full_name || ""),
      email,
    },
  };
}
