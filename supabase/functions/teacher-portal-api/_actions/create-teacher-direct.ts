import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ApiError } from "../_lib/errors.ts";
import { json, safeLower, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";

export async function createTeacherDirectAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;

  const fullName = String(params?.full_name || "").trim();
  const email = safeLower(params?.email);
  const tempPassword = String(params?.temp_password || "");
  const phone = String(params?.phone || "").trim() || null;
  const groupId = String(params?.group_id || "").trim() || null;
  const subgroupId = String(params?.subgroup_id || "").trim() || null;
  const notes = String(params?.notes || "").trim() || null;
  const actorEmail = safeLower(auth?.user?.email) || auth?.user?.id || "admin";

  try {
    const roleRes = await withTimeout(
      db.from("profiles").select("role").eq("user_id", auth.user.id).maybeSingle(),
      "load caller role",
    );

    if (roleRes.error) {
      throw new ApiError("UNAUTHORIZED", "Admin role required", 403);
    }

    const role = safeLower(roleRes.data?.role);
    if (role !== "admin" && role !== "superadmin") {
      throw new ApiError("UNAUTHORIZED", "Admin role required", 403);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("UNAUTHORIZED", "Admin role required", 403);
  }

  if (!fullName) throw new ApiError("INVALID_PAYLOAD", "full_name is required", 400);
  if (!email || !email.includes("@")) throw new ApiError("INVALID_PAYLOAD", "valid email is required", 400);
  if (tempPassword.length < 8 || tempPassword.length > 72) {
    throw new ApiError("INVALID_PAYLOAD", "temp_password must be between 8 and 72 characters", 400);
  }

  let teacherId: string | null = null;
  try {
    const rpcRes = await withTimeout(
      db.rpc("admin_create_teacher_direct", {
        p_full_name: fullName,
        p_email: email,
        p_phone: phone,
        p_group_id: groupId,
        p_subgroup_id: subgroupId,
        p_notes: notes,
        p_actor_email: actorEmail,
      }),
      "admin_create_teacher_direct rpc",
    );

    if (rpcRes.error) {
      return json({ ok: false, error: String(rpcRes.error.message || "Teacher creation failed") }, 500);
    }

    const rpcData = rpcRes.data || {};
    if (!rpcData.ok) {
      return json({
        ok: false,
        error: String(rpcData.error || "Teacher creation failed"),
        teacher_id: rpcData.teacher_id || null,
      });
    }
    teacherId = String(rpcData.teacher_id || "").trim() || null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || "Teacher creation failed");
    return json({ ok: false, error: message }, 500);
  }

  if (!teacherId) return json({ ok: false, error: "Teacher creation failed: missing teacher_id" }, 500);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let authUserId: string | null = null;
  try {
    const createUserRes = await withTimeout(
      adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          created_by: actorEmail,
          provisioned_direct: true,
        },
      }),
      "create auth user",
    );

    if (createUserRes.error || !createUserRes.data?.user?.id) {
      const reason = String(createUserRes.error?.message || "Unknown auth user creation error");
      try {
        await withTimeout(
          db.from("teachers").update({ deleted_at: new Date().toISOString(), updated_by: actorEmail }).eq("teacher_id", teacherId),
          "soft delete teacher rollback",
        );
      } catch (rollbackErr) {
        console.warn("[createTeacherDirect] rollback soft-delete failed", rollbackErr);
      }

      try {
        await withTimeout(
          db.from("audit_logs").insert({
            action: "teacher_create_direct_rollback",
            actor_id: auth.user.id,
            target_id: teacherId,
            entity_type: "teacher",
            metadata: { error: reason, email, method: "direct_no_email" },
          }),
          "audit rollback",
        );
      } catch (auditErr) {
        console.warn("[createTeacherDirect] rollback audit failed", auditErr);
      }

      return json({ ok: false, error: `Auth user creation failed: ${reason}` }, 500);
    }

    authUserId = String(createUserRes.data.user.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err || "Unknown auth user creation error");
    try {
      await withTimeout(
        db.from("teachers").update({ deleted_at: new Date().toISOString(), updated_by: actorEmail }).eq("teacher_id", teacherId),
        "soft delete teacher rollback",
      );
    } catch (rollbackErr) {
      console.warn("[createTeacherDirect] rollback soft-delete failed", rollbackErr);
    }
    try {
      await withTimeout(
        db.from("audit_logs").insert({
          action: "teacher_create_direct_rollback",
          actor_id: auth.user.id,
          target_id: teacherId,
          entity_type: "teacher",
          metadata: { error: reason, email, method: "direct_no_email" },
        }),
        "audit rollback",
      );
    } catch (auditErr) {
      console.warn("[createTeacherDirect] rollback audit failed", auditErr);
    }
    return json({ ok: false, error: `Auth user creation failed: ${reason}` }, 500);
  }

  try {
    const linkRes = await withTimeout(
      db.rpc("link_teacher_to_auth_user", {
        p_teacher_email: email,
        p_auth_user_id: authUserId,
        p_actor_email: actorEmail,
      }),
      "link_teacher_to_auth_user rpc",
    );
    if (linkRes.error) {
      console.warn("[createTeacherDirect] link_teacher_to_auth_user failed", linkRes.error.message);
    }
  } catch (err) {
    console.warn("[createTeacherDirect] link_teacher_to_auth_user failed", err);
  }

  try {
    const upsertRes = await withTimeout(
      db.from("profiles").upsert(
        {
          user_id: authUserId,
          email,
          full_name: fullName,
          role: "teacher",
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      ),
      "profiles upsert",
    );
    if (upsertRes.error) {
      console.warn("[createTeacherDirect] profiles upsert failed", upsertRes.error.message);
    }
  } catch (err) {
    console.warn("[createTeacherDirect] profiles upsert failed", err);
  }

  try {
    await withTimeout(
      db.from("audit_logs").insert({
        action: "teacher_auth_user_linked",
        actor_id: auth.user.id,
        target_id: teacherId,
        entity_type: "teacher",
        metadata: {
          auth_user_id: authUserId,
          email,
          method: "direct_no_email",
          profile_role: "teacher",
        },
      }),
      "final audit log",
    );
  } catch (err) {
    console.warn("[createTeacherDirect] final audit log failed", err);
  }

  return json({
    ok: true,
    teacher_id: teacherId,
    auth_user_id: authUserId,
    email,
    temp_password: tempPassword,
  });
}
