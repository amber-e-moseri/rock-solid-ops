import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUEST_TIMEOUT_MS = 15000;

type ApiErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_TEACHER_MAPPING"
  | "TEACHER_NOT_ACTIVE"
  | "UNAUTHORIZED_CLASS_ACCESS"
  | "INVALID_PAYLOAD"
  | "REQUEST_TIMEOUT"
  | "INTERNAL_ERROR";

class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  constructor(code: ApiErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

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

function applyAllowedOrigin(req: Request) {
  const allowed = String(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const origin = String(req.headers.get("Origin") || "").trim();
  if (origin && allowed.includes(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
  } else {
    delete corsHeaders["Access-Control-Allow-Origin"];
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new ApiError("REQUEST_TIMEOUT", `${label} timed out`, 504)), timeoutMs);
    }),
  ]);
}

function getBearerToken(req: Request): string {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new ApiError("UNAUTHORIZED", "Missing or invalid bearer token", 401);
  return match[1].trim();
}

function safeLower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function parseDate(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeTimeSlot(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const hhmmss = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (hhmmss) {
    return `${hhmmss[1].padStart(2, "0")}:${hhmmss[2]}:${String(hhmmss[3] || "00").padStart(2, "0")}`;
  }
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!ampm) return null;
  let hh = Number(ampm[1]);
  const mm = ampm[2];
  const ap = ampm[3].toUpperCase();
  if (ap === "PM" && hh < 12) hh += 12;
  if (ap === "AM" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${mm}:00`;
}

async function writeAudit(
  db: ReturnType<typeof createClient>,
  input: {
    action: string;
    actorEmail?: string;
    actorId?: string;
    entityType?: string;
    entityId?: string;
    status?: string;
    details?: Record<string, unknown>;
  },
) {
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

async function resolveAuthContext(req: Request, dbService: ReturnType<typeof createClient>) {
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
    await writeAudit(dbService, {
      action: "TEACHER_ACCESS_DENIED",
      actorId: user.id,
      actorEmail: email,
      status: "INVALID_TEACHER_MAPPING",
      details: { reason: teacherRes.error?.message || "No teacher row found" },
    });
    throw new ApiError("INVALID_TEACHER_MAPPING", "No teacher record mapped to this account", 403);
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

async function assertClassOwnership(
  db: ReturnType<typeof createClient>,
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

Deno.serve(async (req) => {
  applyAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed", code: "INVALID_PAYLOAD" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await withTimeout(req.json(), "request json parse");
    const action = String(body.action || "").trim();
    const params = body.params || {};
    if (!action) throw new ApiError("INVALID_PAYLOAD", "action is required", 400);

    const auth = await resolveAuthContext(req, db);

    if (action === "lookupTeacherForAttendance") {
      const query = safeLower(params.query);
      const teacher = auth.teacher;
      const hay = `${safeLower(teacher.fullName)} ${safeLower(teacher.email)} ${safeLower(teacher.teacherId)}`;
      const matches = !query || hay.includes(query);
      const rows = matches
        ? [{ teacherId: teacher.teacherId, fullName: teacher.fullName, email: teacher.email, subGroupLabel: "" }]
        : [];
      return json({ ok: true, data: rows });
    }

    if (action === "getTeacherActiveClassOptions") {
      const teacherId = auth.teacher.teacherId;
      const { data, error } = await withTimeout(
        db
          .from("class_options")
          .select("class_option_id,teacher_id,day,class_time,fellowship_codes,active,enrollment_open,deleted_at")
          .eq("teacher_id", teacherId)
          .eq("active", true)
          .eq("enrollment_open", true)
          .is("deleted_at", null)
          .order("day")
          .order("class_time"),
        "fetch teacher classes",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load classes", 500);

      const mapRows = await withTimeout(
        db.from("fellowship_map").select("fellowship_code,campus_name"),
        "fetch fellowship map",
      );
      const campusByCode = new Map((mapRows.data || []).map((x) => [x.fellowship_code, x.campus_name]));
      const rows = (data || []).map((r) => {
        const codes = Array.isArray(r.fellowship_codes) ? r.fellowship_codes : [];
        const first = String(codes[0] || "");
        const campus = campusByCode.get(first) || first || "Campus";
        const t = String(r.class_time || "00:00:00");
        const [hh, mm] = t.slice(0, 5).split(":").map(Number);
        const ap = hh >= 12 ? "PM" : "AM";
        const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
        return {
          classOptionId: r.class_option_id,
          campus,
          fellowship: first,
          day: r.day || "",
          time: `${h12}:${String(mm || 0).padStart(2, "0")} ${ap}`,
          batch: "",
          enrolledCount: 0,
        };
      });
      return json({ ok: true, data: rows });
    }

    if (action === "loadAttendanceRoster") {
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const { data, error } = await withTimeout(
        db
          .from("class_roster")
          .select("student_id,class_option_id,status,students(student_id,full_name,email,phone,fellowship_code,status,class_option_id)")
          .eq("class_option_id", classOptionId)
          .eq("status", "Active")
          .order("created_at"),
        "fetch attendance roster",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load roster", 500);

      const roster = (data || [])
        .map((row) => {
          const s = Array.isArray(row.students) ? row.students[0] : row.students;
          if (!s?.student_id) return null;
          return {
            id: s.student_id,
            studentId: s.student_id,
            applicantId: "",
            personType: "Student",
            fullName: s.full_name || "",
            email: s.email || "",
            phone: s.phone || "",
            fellowshipCode: s.fellowship_code || "",
            sourceClassOptionId: row.class_option_id || classOptionId,
            sourceSession: "",
            source: "class_roster",
            status: s.status || row.status || "Active",
          };
        })
        .filter(Boolean);

      const { data: fellowships } = await withTimeout(
        db.from("fellowship_map").select("fellowship_code,campus_name").eq("active", true).order("campus_name"),
        "fetch fellowships",
      );

      return json({
        ok: true,
        data: {
          roster,
          fellowships: (fellowships || []).map((f) => ({ code: f.fellowship_code, name: f.campus_name })),
          alreadySubmitted: false,
          previousSubmissionSummary: "",
        },
      });
    }

    if (action === "searchAttendancePerson") {
      const query = String(params.query || "").trim().toLowerCase();
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const studentsRes = await withTimeout(
        db
          .from("students")
          .select("student_id,full_name,email,fellowship_code,class_option_id,status")
          .eq("class_option_id", classOptionId)
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .is("deleted_at", null)
          .limit(25),
        "search students",
      );
      if (studentsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to search students", 500);

      const applicantsRes = await withTimeout(
        db
          .from("applicants")
          .select("id,first_name,last_name,email,fellowship_code,class_option_id,status")
          .eq("class_option_id", classOptionId)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(25),
        "search applicants",
      );
      if (applicantsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to search applicants", 500);

      const rows = [
        ...(studentsRes.data || []).map((s) => ({
          id: s.student_id,
          studentId: s.student_id,
          applicantId: "",
          fullName: s.full_name || "",
          email: s.email || "",
          fellowshipCode: s.fellowship_code || "",
          classOptionId: s.class_option_id || "",
          sourceClassOptionId: s.class_option_id || classOptionId,
          personType: "Student",
          status: s.status || "",
        })),
        ...(applicantsRes.data || []).map((a) => ({
          id: `APP-${a.id}`,
          studentId: "",
          applicantId: a.id,
          fullName: `${a.first_name || ""} ${a.last_name || ""}`.trim(),
          email: a.email || "",
          fellowshipCode: a.fellowship_code || "",
          classOptionId: a.class_option_id || "",
          sourceClassOptionId: a.class_option_id || classOptionId,
          personType: "Applicant",
          status: a.status || "",
        })),
      ];
      return json({ ok: true, data: rows });
    }

    if (action === "getTeacherClassProgressGrid") {
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const { data: students, error } = await withTimeout(
        db
          .from("students")
          .select("student_id,full_name")
          .eq("class_option_id", classOptionId)
          .is("deleted_at", null)
          .order("full_name"),
        "fetch progress students",
      );
      if (error) throw new ApiError("INTERNAL_ERROR", "Failed to load progress grid", 500);

      const studentIds = (students || []).map((s) => s.student_id);
      const logRes = studentIds.length
        ? await withTimeout(
            db.from("attendance_log").select("student_id,class_number,present").in("student_id", studentIds).eq("class_option_id", classOptionId),
            "fetch attendance logs",
          )
        : { data: [], error: null };
      if (logRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load attendance logs", 500);

      const byStudent = new Map<string, Record<string, boolean>>();
      (logRes.data || []).forEach((r) => {
        const key = String(r.student_id || "");
        const map = byStudent.get(key) || {};
        if (r.class_number && r.present === true) map[String(r.class_number)] = true;
        byStudent.set(key, map);
      });

      const result = (students || []).map((s) => {
        const m = byStudent.get(String(s.student_id)) || {};
        return {
          studentId: s.student_id,
          fullName: s.full_name,
          "1_Class": Boolean(m["Class1"] || m["1"]),
          "2_Class": Boolean(m["Class2"] || m["2"]),
          "3_Class": Boolean(m["Class3"] || m["3"]),
          "4A_Class": Boolean(m["Class4A"] || m["4A"]),
          "4B_Class": Boolean(m["Class4B"] || m["4B"]),
          "5_Class": Boolean(m["Class5"] || m["5"]),
          "6_Class": Boolean(m["Class6"] || m["6"]),
          "7_Class": Boolean(m["Class7"] || m["7"]),
        };
      });
      return json({ ok: true, data: { students: result } });
    }

    if (action === "submitTeacherAttendance") {
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const classSession = String(params.classSession || "").trim();
      const classDate = parseDate(params.classDate);
      const records = Array.isArray(params.records) ? params.records : [];

      const classSessions = classSession
        .split(",")
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      if (!classSessions.length) throw new ApiError("INVALID_PAYLOAD", "classSession is required", 400);

      const eligibleRecords = records.filter((r) => r && r.studentId);
      const allStudentIds = [...new Set(eligibleRecords.map((r) => String(r.studentId)))];
      const presentStudentIds = eligibleRecords
        .filter((r) => String(r.attendanceStatus || "").toLowerCase() === "present")
        .map((r) => String(r.studentId));

      const rosterMetaByStudentId = new Map<string, { group_id: string | null; subgroup_id: string | null; batch_id: string | null }>();
      if (allStudentIds.length) {
        const validStudentsRes = await withTimeout(
          db
            .from("class_roster")
            .select("student_id,class_option_id,status,group_id,subgroup_id,batch_id")
            .in("student_id", allStudentIds)
            .eq("class_option_id", classOptionId)
            .eq("status", "Active"),
          "validate students for attendance",
        );
        if (validStudentsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to validate students", 500);

        for (const row of validStudentsRes.data || []) {
          rosterMetaByStudentId.set(String(row.student_id), {
            group_id: row.group_id ?? null,
            subgroup_id: row.subgroup_id ?? null,
            batch_id: row.batch_id ?? null,
          });
        }

        const validIds = new Set((validStudentsRes.data || []).map((s) => String(s.student_id)));
        const invalidIds = allStudentIds.filter((id) => !validIds.has(id));
        if (invalidIds.length) {
          await writeAudit(db, {
            action: "UNAUTHORIZED_CLASS_ACCESS",
            actorEmail: auth.teacher.email,
            actorId: auth.user.id,
            entityType: "attendance_log",
            entityId: classOptionId,
            status: "denied",
            details: { invalidStudentIds: invalidIds },
          });
          throw new ApiError("UNAUTHORIZED_CLASS_ACCESS", "One or more students are not in your class roster", 403);
        }
      }

      const nowIso = new Date().toISOString();
      const inserts = presentStudentIds.flatMap((studentId) =>
        classSessions.map((session) => ({
          student_id: studentId,
          // Source group/subgroup/batch from class_roster metadata; keep null if unavailable.
          group_id: rosterMetaByStudentId.get(studentId)?.group_id ?? null,
          subgroup_id: rosterMetaByStudentId.get(studentId)?.subgroup_id ?? null,
          batch_id: rosterMetaByStudentId.get(studentId)?.batch_id ?? null,
          class_option_id: classOptionId || null,
          teacher_name: auth.teacher.fullName || null,
          class_number: session,
          class_date: classDate,
          present: true,
          submitted_by_teacher: true,
          submission_date: nowIso,
        })),
      );

      const dedupe = new Map<string, typeof inserts[number]>();
      for (const row of inserts) {
        // attendance_log dedupe key aligns with DB upsert conflict key.
        const key = `${row.student_id}::${row.class_option_id}::${row.class_number}::${row.class_date || ""}`;
        if (!dedupe.has(key)) dedupe.set(key, row);
      }
      const uniqueInserts = [...dedupe.values()];

      if (uniqueInserts.length) {
        const upsertRes = await withTimeout(
          db.from("attendance_log").upsert(uniqueInserts, {
            onConflict: "student_id,class_option_id,class_number,class_date",
          }),
          "attendance upsert",
        );
        if (upsertRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to save attendance", 500);
      }

      await writeAudit(db, {
        action: "ATTENDANCE_SUBMITTED",
        actorEmail: auth.teacher.email,
        actorId: auth.user.id,
        entityType: "class_options",
        entityId: classOptionId,
        status: "ok",
        details: {
          inserted: uniqueInserts.length,
          presentStudents: presentStudentIds.length,
          sessions: classSessions,
          classDate,
        },
      });

      return json({ ok: true, data: { inserted: uniqueInserts.length } });
    }

    if (action === "getMilestonesForSession") {
      const classSession = String(params.classSession || "Class1");
      return json({ ok: true, data: MILESTONE_DEFAULTS[classSession] || MILESTONE_DEFAULTS.Class1 });
    }

    if (action === "submitSessionOutcomes") {
      const classOptionId = String(params.classOptionId || "").trim();
      await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

      const entries = Array.isArray(params.entries) ? params.entries : [];
      const classSession = String(params.classSession || "");
      const classDate = parseDate(params.classDate);

      const studentIds = entries.map((e) => String(e?.studentId || "")).filter(Boolean);
      if (studentIds.length) {
        const validStudentsRes = await withTimeout(
          db
            .from("class_roster")
            .select("student_id")
            .in("student_id", studentIds)
            .eq("class_option_id", classOptionId)
            .eq("status", "Active"),
          "validate students for outcomes",
        );
        if (validStudentsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to validate outcomes students", 500);

        const validIds = new Set((validStudentsRes.data || []).map((s) => String(s.student_id)));
        const invalidIds = studentIds.filter((id) => !validIds.has(id));
        if (invalidIds.length) {
          await writeAudit(db, {
            action: "UNAUTHORIZED_CLASS_ACCESS",
            actorEmail: auth.teacher.email,
            actorId: auth.user.id,
            entityType: "session_outcomes",
            entityId: classOptionId,
            status: "denied",
            details: { invalidStudentIds: invalidIds },
          });
          throw new ApiError("UNAUTHORIZED_CLASS_ACCESS", "One or more outcome entries are outside your class roster", 403);
        }
      }

      const rows = entries.map((e) => ({
        teacher_id: auth.teacher.teacherId,
        class_option_id: classOptionId,
        class_session: classSession,
        class_date: classDate,
        student_id: String(e.studentId || ""),
        person_type: String(e.personType || ""),
        full_name: String(e.fullName || ""),
        email: String(e.email || ""),
        milestone_id: String(e.milestoneId || ""),
        question: String(e.question || ""),
        outcome_result: String(e.outcomeResult || ""),
        submitted: Boolean(params.submitted),
      }));

      const dedupedRows = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        // session_outcomes dedupe key aligns with unique index + upsert conflict key.
        const key = `${row.class_option_id}::${row.class_session}::${row.class_date || ""}::${row.student_id}::${row.milestone_id}`;
        if (!dedupedRows.has(key)) dedupedRows.set(key, row);
      }
      const uniqueRows = [...dedupedRows.values()];

      if (uniqueRows.length) {
        const upsertRes = await withTimeout(
          db.from("session_outcomes").upsert(uniqueRows, {
            onConflict: "class_option_id,class_session,class_date,student_id,milestone_id",
          }),
          "upsert session outcomes",
        );
        if (upsertRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to save session outcomes", 500);
      }

      await writeAudit(db, {
        action: "PROGRESS_UPDATED",
        actorEmail: auth.teacher.email,
        actorId: auth.user.id,
        entityType: "session_outcomes",
        entityId: classOptionId,
        status: "ok",
        details: { saved: uniqueRows.length, classSession, classDate },
      });

      return json({ ok: true, data: { saved: uniqueRows.length } });
    }

    if (action === "submitTeacherAvailability") {
      const slots = Array.isArray(params.slots) ? params.slots : [];
      if (!slots.length) throw new ApiError("INVALID_PAYLOAD", "No slots provided", 400);

      const inserts = slots.map((s) => ({
        teacher_id: auth.teacher.teacherId,
        day: String(s.teacherDay || s.day || "").trim(),
        time_slot: normalizeTimeSlot(s.timeSlot || s.time),
        status: "Pending",
        notes: String(s.notes || "Teacher portal submission").slice(0, 300),
        created_by: auth.teacher.email,
        updated_by: auth.teacher.email,
      })).filter((s) => s.day && s.time_slot);

      if (!inserts.length) throw new ApiError("INVALID_PAYLOAD", "No valid availability slots", 400);

      const insertRes = await withTimeout(db.from("teacher_availability").insert(inserts), "insert availability");
      if (insertRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to save availability", 500);

      await writeAudit(db, {
        action: "AVAILABILITY_UPDATED",
        actorEmail: auth.teacher.email,
        actorId: auth.user.id,
        entityType: "teacher_availability",
        entityId: auth.teacher.teacherId,
        status: "ok",
        details: { inserted: inserts.length },
      });

      return json({ ok: true, data: { inserted: inserts.length } });
    }

    throw new ApiError("INVALID_PAYLOAD", `Unsupported action: ${action}`, 400);
  } catch (err) {
    if (err instanceof ApiError) {
      return json({ ok: false, error: err.message, code: err.code }, err.status);
    }

    return json({ ok: false, error: "Request failed", code: "INTERNAL_ERROR" }, 500);
  }
});

