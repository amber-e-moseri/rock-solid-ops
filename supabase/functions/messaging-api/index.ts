import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAnonClient, createServiceClient } from "../_shared/supabase.ts";

type AuthRole = "teacher" | "subgroup_admin" | "pastor" | "regional_secretary" | "principal" | "admin" | "superadmin";

type AuthContext = {
  user: { id: string; email: string | null };
  profile: { role: AuthRole; full_name: string | null; email: string | null };
  groups: Set<string>;
  subgroups: Set<string>;
};

const STAFF_ROLES = new Set(["teacher", "subgroup_admin", "pastor", "regional_secretary", "principal", "admin", "superadmin"]);

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

function clean(v: unknown) {
  return String(v || "").trim();
}

async function resolveJurisdictionForUser(db: any, userId: string, email: string | null, role: string) {
  const groups = new Set<string>();
  const subgroups = new Set<string>();

  if (role === "teacher") {
    let teacher: any = null;
    {
      const byUser = await db
        .from("teachers")
        .select("teacher_id")
        .eq("teacher_user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      teacher = byUser.data;
    }
    if (!teacher && email) {
      const byEmail = await db
        .from("teachers")
        .select("teacher_id")
        .ilike("email", email)
        .is("deleted_at", null)
        .maybeSingle();
      teacher = byEmail.data;
    }
    if (teacher?.teacher_id) {
      const { data: classes } = await db
        .from("class_options")
        .select("group_id,subgroup_id")
        .eq("teacher_id", teacher.teacher_id)
        .is("deleted_at", null)
        .eq("active", true)
        .limit(200);
      for (const row of classes || []) {
        if (row?.group_id) groups.add(String(row.group_id));
        if (row?.subgroup_id) subgroups.add(String(row.subgroup_id));
      }
    }
    return { groups, subgroups };
  }

  const { data: adminRow } = await db
    .from("admin_users")
    .select("group_id,subgroup_id,subgroups")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (adminRow?.group_id) groups.add(String(adminRow.group_id));
  if (adminRow?.subgroup_id) subgroups.add(String(adminRow.subgroup_id));
  if (Array.isArray(adminRow?.subgroups)) {
    for (const sg of adminRow.subgroups) subgroups.add(String(sg));
  }

  if ((role === "pastor" || role === "subgroup_admin") && subgroups.size && !groups.size) {
    const { data: fmap } = await db
      .from("fellowship_map")
      .select("subgroup_id,group_id")
      .in("subgroup_id", [...subgroups]);
    for (const row of fmap || []) {
      if (row?.group_id) groups.add(String(row.group_id));
    }
  }

  return { groups, subgroups };
}

async function resolveAuth(req: Request, db: any): Promise<AuthContext> {
  const authHeader = String(req.headers.get("Authorization") || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) throw new Error("Missing bearer token");

  const anon = createAnonClient(token);
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user) throw new Error("Invalid session");
  const user = userData.user;

  const { data: profile } = await db
    .from("profiles")
    .select("role,email,full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = String(profile?.role || "").trim().toLowerCase();
  if (!STAFF_ROLES.has(role)) throw new Error("Access denied");

  const { groups, subgroups } = await resolveJurisdictionForUser(db, user.id, user.email || null, role);

  return {
    user: { id: user.id, email: user.email || profile?.email || null },
    profile: {
      role: role as AuthRole,
      email: profile?.email || user.email || null,
      full_name: profile?.full_name || null,
    },
    groups,
    subgroups,
  };
}

function canAccessScope(auth: AuthContext, scopeLevel: string, scopeGroupId: string | null, scopeSubgroupId: string | null) {
  const role = auth.profile.role;
  if (role === "admin" || role === "superadmin" || role === "regional_secretary") return true;
  if (role === "principal") return true;
  if (role === "pastor") {
    if (scopeLevel === "GROUP" || scopeLevel === "SUBGROUP") {
      return !!scopeGroupId && auth.groups.has(String(scopeGroupId));
    }
    return false;
  }
  if (role === "subgroup_admin") {
    if (scopeLevel === "SUBGROUP") return !!scopeSubgroupId && auth.subgroups.has(String(scopeSubgroupId));
    if (scopeLevel === "GROUP") return !!scopeGroupId && auth.groups.has(String(scopeGroupId));
    return false;
  }
  if (role === "teacher") {
    if (scopeLevel === "SUBGROUP") return !!scopeSubgroupId && auth.subgroups.has(String(scopeSubgroupId));
    if (scopeLevel === "GROUP") return !!scopeGroupId && auth.groups.has(String(scopeGroupId));
    return false;
  }
  return false;
}

async function getConversationForUser(db: any, auth: AuthContext, conversationId: string) {
  const { data: conv } = await db
    .from("message_conversations")
    .select("id,subject,scope_level,scope_group_id,scope_subgroup_id,updated_at,created_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) return null;

  const { data: member } = await db
    .from("message_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!member && !canAccessScope(auth, String(conv.scope_level || ""), conv.scope_group_id || null, conv.scope_subgroup_id || null)) {
    return null;
  }

  return conv;
}

async function listConversations(db: any, auth: AuthContext) {
  const { data: parts, error: pErr } = await db
    .from("message_participants")
    .select("conversation_id,last_read_at")
    .eq("user_id", auth.user.id)
    .limit(500);
  if (pErr) throw pErr;

  const partMap = new Map<string, string | null>();
  const ids = [...new Set((parts || []).map((p: any) => String(p.conversation_id || "")).filter(Boolean))];
  for (const p of parts || []) partMap.set(String(p.conversation_id), p.last_read_at || null);
  if (!ids.length) return [];

  const { data: convs, error: cErr } = await db
    .from("message_conversations")
    .select("id,subject,scope_level,scope_group_id,scope_subgroup_id,updated_at,created_at")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (cErr) throw cErr;

  const out: any[] = [];
  for (const conv of convs || []) {
    const conversationId = String(conv.id);
    const { data: latest } = await db
      .from("message_messages")
      .select("id,body,sender_name,sender_role,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: pRows } = await db
      .from("message_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);
    const participantIds = (pRows || []).map((r: any) => String(r.user_id || "")).filter(Boolean);
    let participantRoles: string[] = [];
    if (participantIds.length) {
      const { data: roleRows } = await db
        .from("profiles")
        .select("user_id,role")
        .in("user_id", participantIds);
      participantRoles = [...new Set((roleRows || []).map((r: any) => clean(r.role).toLowerCase()).filter(Boolean))];
    }

    const lastReadAt = partMap.get(conversationId) || null;
    let unreadQ = db.from("message_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId);
    if (lastReadAt) unreadQ = unreadQ.gt("created_at", lastReadAt);
    const unreadRes = await unreadQ;

    out.push({
      ...conv,
      latest_message: latest || null,
      unread_count: Number(unreadRes.count || 0),
      participant_count: participantIds.length,
      participant_roles: participantRoles,
    });
  }

  return out;
}

async function getRecipientOptions(db: any, auth: AuthContext) {
  const role = auth.profile.role;
  const staffRoles = ["teacher", "subgroup_admin", "pastor", "regional_secretary", "principal", "admin", "superadmin"];
  const { data: profiles, error: pErr } = await db
    .from("profiles")
    .select("user_id,email,full_name,role")
    .in("role", staffRoles)
    .limit(5000);
  if (pErr) throw pErr;
  const allRows = (profiles || []).map((r: any) => ({
    user_id: clean(r.user_id),
    email: clean(r.email).toLowerCase(),
    full_name: clean(r.full_name),
    role: clean(r.role).toLowerCase(),
    group_id: null,
    subgroup_id: null,
  })).filter((r: any) => r.user_id);

  const adminRoles = new Set(["admin", "superadmin", "regional_secretary", "principal", "subgroup_admin", "pastor"]);
  const byEmail = new Map(allRows.filter((r: any) => r.email).map((r: any) => [r.email, r]));

  const { data: teachers } = await db
    .from("teachers")
    .select("teacher_id,teacher_user_id,email")
    .is("deleted_at", null);
  const teacherById = new Map<string, any>();
  const teacherScoped = new Map<string, { group_id: string | null; subgroup_id: string | null }>();
  for (const t of teachers || []) {
    if (t?.teacher_id) teacherById.set(String(t.teacher_id), t);
  }
  const { data: classRows } = await db
    .from("class_options")
    .select("teacher_id,group_id,subgroup_id,active")
    .is("deleted_at", null)
    .eq("active", true)
    .limit(5000);
  for (const row of classRows || []) {
    const tid = clean(row.teacher_id);
    if (!tid) continue;
    const g = clean(row.group_id) || null;
    const sg = clean(row.subgroup_id) || null;
    if (!teacherScoped.has(tid)) teacherScoped.set(tid, { group_id: g, subgroup_id: sg });
  }

  for (const [tid, scope] of teacherScoped.entries()) {
    const t = teacherById.get(tid);
    if (!t) continue;
    const uid = clean(t.teacher_user_id);
    const email = clean(t.email).toLowerCase();
    const p = uid ? allRows.find((x: any) => x.user_id === uid) : (email ? byEmail.get(email) : null);
    if (p) {
      p.group_id = scope.group_id;
      p.subgroup_id = scope.subgroup_id;
    }
  }

  let recipients = allRows;
  if (role === "teacher") {
    recipients = allRows.filter((r: any) => r.role === "teacher" || adminRoles.has(r.role));
  } else if (role === "pastor" || role === "subgroup_admin") {
    const admins = allRows.filter((r: any) => adminRoles.has(r.role));
    const scopedTeachers = allRows.filter((r: any) => {
      if (r.role !== "teacher") return false;
      if (auth.subgroups.size && r.subgroup_id) return auth.subgroups.has(String(r.subgroup_id));
      if (auth.groups.size && r.group_id) return auth.groups.has(String(r.group_id));
      return false;
    });
    const map = new Map<string, any>();
    [...admins, ...scopedTeachers].forEach((r: any) => map.set(r.user_id, r));
    recipients = [...map.values()];
  }

  const groupedByRole = recipients.reduce((acc: Record<string, any[]>, row: any) => {
    const key = row.role || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return { recipients, groupedByRole };
}

async function listMessages(db: any, auth: AuthContext, params: any) {
  const conversationId = clean(params?.conversationId);
  if (!conversationId) throw new Error("conversationId is required");

  const conv = await getConversationForUser(db, auth, conversationId);
  if (!conv) throw new Error("Conversation not found");

  const limit = Math.max(1, Math.min(200, Number(params?.limit || 50)));
  const before = clean(params?.before);

  let q = db
    .from("message_messages")
    .select("id,conversation_id,sender_user_id,sender_role,sender_name,body,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;
  if (error) throw error;

  return { conversation: conv, messages: (data || []).reverse() };
}

async function markRead(db: any, auth: AuthContext, params: any) {
  const conversationId = clean(params?.conversationId);
  if (!conversationId) throw new Error("conversationId is required");

  const conv = await getConversationForUser(db, auth, conversationId);
  if (!conv) throw new Error("Conversation not found");

  const now = new Date().toISOString();
  const { error } = await db
    .from("message_participants")
    .update({ last_read_at: now })
    .eq("conversation_id", conversationId)
    .eq("user_id", auth.user.id);
  if (error) throw error;

  return { conversation_id: conversationId, last_read_at: now };
}

async function ensureParticipants(db: any, conversationId: string, userIds: string[], senderRole: string) {
  for (const uid of userIds) {
    const { data: existing } = await db
      .from("message_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", uid)
      .maybeSingle();

    if (!existing) {
      await db.from("message_participants").insert({
        conversation_id: conversationId,
        user_id: uid,
        participant_role: senderRole,
      });
    }
  }
}

async function queueMessageEmails(db: any, senderName: string, messageBody: string, recipients: any[]) {
  for (const recipient of recipients) {
    const email = clean(recipient?.email);
    if (!email) continue;
    await db.from("email_queue").insert({
      recipient_email: email,
      recipient_name: clean(recipient?.full_name) || clean(recipient?.name) || "",
      template_key: "direct_message",
      subject: `New message from ${senderName}`,
      status: "Pending",
      payload: {
        recipient_name: clean(recipient?.full_name) || clean(recipient?.name) || "",
        message: messageBody,
        sender_name: senderName,
      },
    });
  }
}

async function sendMessage(db: any, auth: AuthContext, params: any) {
  const body = clean(params?.body);
  if (!body) throw new Error("Message body is required");

  let conversationId = clean(params?.conversationId);
  const recipientUserIds = Array.isArray(params?.recipientUserIds)
    ? [...new Set(params.recipientUserIds.map((v: unknown) => clean(v)).filter(Boolean))]
    : [];

  if (!conversationId && !recipientUserIds.length) {
    throw new Error("recipientUserIds is required when creating a conversation");
  }

  if (!conversationId) {
    const defaultScope = auth.profile.role === "regional_secretary" || auth.profile.role === "admin" || auth.profile.role === "superadmin"
      ? "CANADA"
      : auth.subgroups.size
        ? "SUBGROUP"
        : "GROUP";

    const scopeLevel = clean(params?.scopeLevel || defaultScope).toUpperCase();
    const scopeGroupId = clean(params?.scopeGroupId) || [...auth.groups][0] || null;
    const scopeSubgroupId = clean(params?.scopeSubgroupId) || [...auth.subgroups][0] || null;

    if (!canAccessScope(auth, scopeLevel, scopeGroupId, scopeSubgroupId)) {
      throw new Error("Scope not allowed for your role");
    }

    const { data: conv, error: cErr } = await db
      .from("message_conversations")
      .insert({
        subject: clean(params?.subject) || null,
        scope_level: scopeLevel,
        scope_group_id: scopeLevel === "CANADA" ? null : scopeGroupId,
        scope_subgroup_id: scopeLevel === "SUBGROUP" ? scopeSubgroupId : null,
        created_by: auth.user.id,
      })
      .select("id")
      .single();
    if (cErr || !conv?.id) throw cErr || new Error("Failed to create conversation");
    conversationId = String(conv.id);

    await ensureParticipants(db, conversationId, [auth.user.id, ...recipientUserIds], auth.profile.role);
  } else {
    const conv = await getConversationForUser(db, auth, conversationId);
    if (!conv) throw new Error("Conversation not found");
    if (recipientUserIds.length) {
      await ensureParticipants(db, conversationId, recipientUserIds, auth.profile.role);
    }
  }

  const senderName = clean(auth.profile.full_name) || clean(auth.profile.email) || "Staff";

  const { data: msg, error: mErr } = await db
    .from("message_messages")
    .insert({
      conversation_id: conversationId,
      sender_user_id: auth.user.id,
      sender_role: auth.profile.role,
      sender_name: senderName,
      body,
    })
    .select("id,conversation_id,sender_user_id,sender_role,sender_name,body,created_at")
    .single();
  if (mErr) throw mErr;

  await db.from("message_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  const { data: participants } = await db
    .from("message_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  const recipientIds = (participants || []).map((r: any) => String(r.user_id || "")).filter((id: string) => id && id !== auth.user.id);

  if (recipientIds.length) {
    const { data: profiles } = await db
      .from("profiles")
      .select("user_id,email,full_name")
      .in("user_id", recipientIds);
    await queueMessageEmails(db, senderName, body, profiles || []);
  }

  return msg;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const db = createServiceClient();
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action);
    const params = body?.params || {};
    if (!action) return json({ ok: false, error: "action is required" }, 400);

    const auth = await resolveAuth(req, db);

    if (action === "listConversations") {
      const data = await listConversations(db, auth);
      return json({ ok: true, data });
    }
    if (action === "listMessages") {
      const data = await listMessages(db, auth, params);
      return json({ ok: true, data });
    }
    if (action === "markRead") {
      const data = await markRead(db, auth, params);
      return json({ ok: true, data });
    }
    if (action === "sendMessage") {
      const data = await sendMessage(db, auth, params);
      return json({ ok: true, data });
    }
    if (action === "getRecipientOptions") {
      const data = await getRecipientOptions(db, auth);
      return json({ ok: true, data });
    }

    return json({ ok: false, error: `Unsupported action: ${action}` }, 400);
  } catch (err) {
    const message = String((err as Error)?.message || "Request failed");
    const status = ["Access denied", "Invalid session", "Missing bearer token"].includes(message) ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});
