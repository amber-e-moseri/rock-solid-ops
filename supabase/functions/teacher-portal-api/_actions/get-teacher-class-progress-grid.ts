import { ApiError } from "../_lib/errors.ts";
import { json, withTimeout } from "../_lib/http.ts";
import type { ActionContext } from "../_lib/types.ts";
import { assertClassOwnership } from "../_lib/class-ownership.ts";

export async function getTeacherClassProgressGridAction(ctx: ActionContext): Promise<Response> {
  const { db, auth, params } = ctx;
  const classes = ["Class1", "Class2", "Class3", "Class4A", "Class4B", "Class5", "Class6", "Class7"];
  const classOptionId = String(params.classOptionId || "").trim();
  await assertClassOwnership(db, classOptionId, auth.teacher.teacherId, { email: auth.teacher.email, userId: auth.user.id });

  const milestonesRes = await withTimeout(
    db
      .from("milestone_definitions")
      .select("id,code,label,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order"),
    "fetch milestone definitions",
  );
  if (milestonesRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load milestone definitions", 500);

  const studentsRes = await withTimeout(
    db
      .from("students")
      .select("student_id,full_name,email")
      .eq("class_option_id", classOptionId)
      .is("deleted_at", null)
      .order("full_name"),
    "fetch progress students",
  );
  if (studentsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load progress students", 500);

  const milestones = (milestonesRes.data || []).map((m: any) => ({
    code: String(m.code || ""),
    label: String(m.label || m.code || ""),
    sort_order: Number(m.sort_order || 0),
  })).filter((m: any) => m.code);

  const students = studentsRes.data || [];
  const studentIds = students.map((s: any) => String(s.student_id || "")).filter(Boolean);
  const studentEmails = students.map((s: any) => String(s.email || "").trim().toLowerCase()).filter(Boolean);

  const applicantsRes = studentEmails.length
    ? await withTimeout(
      db
        .from("applicants")
        .select("id,email,born_again,speaks_in_tongues,water_baptized")
        .in("email", studentEmails),
      "fetch applicant faith profile rows",
    )
    : { data: [], error: null };
  if (applicantsRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load applicant faith profile rows", 500);

  const statusRes = studentIds.length
    ? await withTimeout(
      db
        .from("student_milestone_status")
        .select("student_id,milestone_code,status,completed_at")
        .in("student_id", studentIds),
      "fetch milestone status rows",
    )
    : { data: [], error: null };
  if (statusRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load milestone statuses", 500);

  const attendanceRes = studentIds.length
    ? await withTimeout(
      db
        .from("attendance_log")
        .select("student_id,class_number,present")
        .eq("class_option_id", classOptionId)
        .in("student_id", studentIds),
      "fetch attendance rows",
    )
    : { data: [], error: null };
  if (attendanceRes.error) throw new ApiError("INTERNAL_ERROR", "Failed to load attendance rows", 500);

  const completedSet = new Set<string>();
  (statusRes.data || []).forEach((row: any) => {
    if (String(row.status || "").toLowerCase() === "completed") {
      completedSet.add(`${String(row.student_id || "")}::${String(row.milestone_code || "")}`);
    }
  });

  const attendanceSet = new Set<string>();
  (attendanceRes.data || []).forEach((row: any) => {
    if (row.present === true) {
      const sid = String(row.student_id || "");
      const classNumber = String(row.class_number || "");
      if (sid && classNumber) attendanceSet.add(`${sid}::${classNumber}`);
    }
  });

  const faithByEmail = new Map<string, {
    applicant_id: string;
    born_again: string | null;
    speaks_in_tongues: string | null;
    water_baptized: string | null;
  }>();
  (applicantsRes.data || []).forEach((row: any) => {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email) return;
    faithByEmail.set(email, {
      applicant_id: String(row.id || ""),
      born_again: row.born_again ?? null,
      speaks_in_tongues: row.speaks_in_tongues ?? null,
      water_baptized: row.water_baptized ?? null,
    });
  });

  const outStudents = students.map((s: any) => {
    const sid = String(s.student_id || "");
    const email = String(s.email || "").trim().toLowerCase();
    const faith = faithByEmail.get(email) || {
      applicant_id: "",
      born_again: null,
      speaks_in_tongues: null,
      water_baptized: null,
    };
    const applicantId = faith.applicant_id || "";
    const outMilestones: Record<string, boolean> = {};
    milestones.forEach((m: any) => {
      outMilestones[m.code] = completedSet.has(`${sid}::${m.code}`);
    });
    const outAttendance: Record<string, boolean> = {};
    classes.forEach((classNumber) => {
      outAttendance[classNumber] = attendanceSet.has(`${sid}::${classNumber}`);
    });
    return {
      studentId: sid,
      applicantId,
      fullName: String(s.full_name || ""),
      bornAgain: faith.born_again,
      speaksInTongues: faith.speaks_in_tongues,
      waterBaptized: faith.water_baptized,
      milestones: outMilestones,
      attendance: outAttendance,
    };
  });

  return json({
    ok: true,
    data: {
      milestones,
      classes,
      students: outStudents,
    },
  });
}
