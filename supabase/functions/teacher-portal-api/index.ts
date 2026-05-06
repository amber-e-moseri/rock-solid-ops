import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MILESTONE_DEFAULTS: Record<string, Array<{ milestoneId: string; question: string }>> = {
  Class1: [
    { milestoneId: "class1_attended", question: "Attended and engaged in Class 1?" },
  ],
  Class2: [
    { milestoneId: "class2_reflection", question: "Submitted Class 2 reflection?" },
  ],
  Class3: [
    { milestoneId: "class3_prayer", question: "Participated in prayer activity?" },
  ],
  Class4A: [
    { milestoneId: "class4a_checkpoint", question: "Completed Class 4A checkpoint?" },
  ],
  Class4B: [
    { milestoneId: "class4b_checkpoint", question: "Completed Class 4B checkpoint?" },
  ],
  Class5: [
    { milestoneId: "class5_checkpoint", question: "Completed Class 5 checkpoint?" },
  ],
  Class6: [
    { milestoneId: "class6_checkpoint", question: "Completed Class 6 checkpoint?" },
  ],
  Class7: [
    { milestoneId: "class7_checkpoint", question: "Completed Class 7 checkpoint?" },
  ],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const action = String(body.action || "").trim();
    const params = body.params || {};

    if (!action) return json({ ok: false, error: "action is required" }, 400);

    if (action === "lookupTeacherForAttendance") {
      const query = String(params.query || "").trim();
      const q = query.toLowerCase();
      const { data, error } = await db
        .from("teachers")
        .select("teacher_id,full_name,email,subgroup_id,active,deleted_at")
        .eq("active", true)
        .is("deleted_at", null)
        .order("full_name")
        .limit(30);
      if (error) throw error;
      const rows = (data || []).filter((r) =>
        String(r.full_name || "").toLowerCase().includes(q) ||
        String(r.email || "").toLowerCase().includes(q) ||
        String(r.teacher_id || "").toLowerCase().includes(q)
      ).map((r) => ({
        teacherId: r.teacher_id,
        fullName: r.full_name,
        email: r.email || "",
        subGroupLabel: r.subgroup_id || "",
      }));
      return json({ ok: true, data: rows });
    }

    if (action === "getTeacherActiveClassOptions") {
      const teacherId = String(params.teacherId || "").trim();
      const { data, error } = await db
        .from("class_options")
        .select("class_option_id,teacher_id,day,class_time,fellowship_codes,active,enrollment_open,deleted_at")
        .eq("teacher_id", teacherId)
        .eq("active", true)
        .eq("enrollment_open", true)
        .is("deleted_at", null)
        .order("day")
        .order("class_time");
      if (error) throw error;

      const mapRows = await db.from("fellowship_map").select("fellowship_code,campus_name");
      const campusByCode = new Map((mapRows.data || []).map((x) => [x.fellowship_code, x.campus_name]));
      const rows = (data || []).map((r) => {
        const codes = Array.isArray(r.fellowship_codes) ? r.fellowship_codes : [];
        const first = codes[0] || "";
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
      const { data, error } = await db
        .from("students")
        .select("student_id,full_name,email,fellowship_code,status,class_option_id")
        .eq("class_option_id", classOptionId)
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw error;
      const roster = (data || []).map((s) => ({
        id: s.student_id,
        studentId: s.student_id,
        applicantId: "",
        personType: "Student",
        fullName: s.full_name || "",
        email: s.email || "",
        fellowshipCode: s.fellowship_code || "",
        sourceClassOptionId: s.class_option_id || classOptionId,
        sourceSession: "",
        source: "student",
        status: s.status || "Active",
      }));
      const { data: fellowships } = await db
        .from("fellowship_map")
        .select("fellowship_code,campus_name")
        .eq("active", true)
        .order("campus_name");
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
      const studentsRes = await db
        .from("students")
        .select("student_id,full_name,email,fellowship_code,class_option_id,status")
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .is("deleted_at", null)
        .limit(25);
      if (studentsRes.error) throw studentsRes.error;
      const applicantsRes = await db
        .from("applicants")
        .select("id,first_name,last_name,email,fellowship_code,class_option_id,status")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(25);
      if (applicantsRes.error) throw applicantsRes.error;
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
      const { data: students, error } = await db
        .from("students")
        .select("student_id,full_name")
        .eq("class_option_id", classOptionId)
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw error;
      const studentIds = (students || []).map((s) => s.student_id);
      const logRes = studentIds.length
        ? await db
          .from("attendance_log")
          .select("student_id,class_number,present")
          .in("student_id", studentIds)
        : { data: [], error: null };
      if (logRes.error) throw logRes.error;
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
      const teacherName = String(params.teacherName || "").trim();
      const classOptionId = String(params.classOptionId || "").trim();
      const classSession = String(params.classSession || "").trim();
      const classDate = String(params.classDate || "").trim();
      const records = Array.isArray(params.records) ? params.records : [];

      const inserts = records
        .filter((r) => r.studentId && String(r.attendanceStatus || "").toLowerCase() === "present")
        .map((r) => ({
          student_id: r.studentId,
          group_id: "CS",
          subgroup_id: "CSGA",
          batch_id: null,
          class_option_id: classOptionId || null,
          teacher_name: teacherName || null,
          class_number: classSession || null,
          class_date: classDate || null,
          present: true,
          submitted_by_teacher: true,
          submission_date: new Date().toISOString(),
        }));
      if (inserts.length) {
        const { error } = await db.from("attendance_log").upsert(inserts, {
          onConflict: "student_id,class_option_id,class_number,class_date",
        });
        if (error) throw error;
      }
      return json({ ok: true, data: { inserted: inserts.length } });
    }

    if (action === "getMilestonesForSession") {
      const classSession = String(params.classSession || "Class1");
      return json({ ok: true, data: MILESTONE_DEFAULTS[classSession] || MILESTONE_DEFAULTS.Class1 });
    }

    if (action === "submitSessionOutcomes") {
      const entries = Array.isArray(params.entries) ? params.entries : [];
      const rows = entries.map((e) => ({
        teacher_id: String(params.teacherId || ""),
        class_option_id: String(params.classOptionId || ""),
        class_session: String(params.classSession || ""),
        class_date: params.classDate || null,
        student_id: String(e.studentId || ""),
        person_type: String(e.personType || ""),
        full_name: String(e.fullName || ""),
        email: String(e.email || ""),
        milestone_id: String(e.milestoneId || ""),
        question: String(e.question || ""),
        outcome_result: String(e.outcomeResult || ""),
        submitted: Boolean(params.submitted),
      }));
      if (rows.length) {
        const { error } = await db.from("session_outcomes").insert(rows);
        if (error) throw error;
      }
      return json({ ok: true, data: { saved: rows.length } });
    }

    return json({ ok: false, error: `Unsupported action: ${action}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg }, 500);
  }
});
