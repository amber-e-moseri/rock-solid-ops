import { assignApplicant } from "./assign-applicant.ts";
import { mockSupabaseClient } from "../test-utils.ts";

Deno.test("Dedup guard: assignApplicant uses upsert conflict keys for students/roster/moodle", async () => {
  const db = mockSupabaseClient(async ({ table, action }) => {
    if (table === "applicants" && action === "select") {
      return { data: { id: "app-1", email: "student@example.com", full_name: "Student One", group_id: "CE", subgroup_id: "CESGA", fellowship_code: "UM" }, error: null };
    }
    if (table === "class_options" && action === "select") {
      return { data: { class_option_id: "class-1", teacher_id: "t-1", teacher_name: "Teacher 1", group_id: "CE", subgroup_id: "CESGA" }, error: null };
    }
    if (table === "class_slots" && action === "select") {
      return { data: { class_slot_id: "slot-1", current_enrolment: 1, max_capacity: 20, status: "Active", batch_id: "MAY2026" }, error: null };
    }
    return { data: [], error: null };
  });

  await assignApplicant("app-1", "class-1", db as any, { batchId: "MAY2026", triggeredBy: "processor" });
  await assignApplicant("app-1", "class-1", db as any, { batchId: "MAY2026", triggeredBy: "processor" });

  const upserts = (db as any).__calls.filter((c: any) => c.action === "upsert");
  const studentUpsert = upserts.find((c: any) => c.table === "students");
  const rosterUpsert = upserts.find((c: any) => c.table === "class_roster");
  const moodleUpsert = upserts.find((c: any) => c.table === "moodle_enrollment_sync");

  if (!studentUpsert || studentUpsert.options?.onConflict !== "student_id") throw new Error("students upsert conflict key missing");
  if (!rosterUpsert || rosterUpsert.options?.onConflict !== "student_id,class_option_id,batch_id") throw new Error("class_roster upsert conflict key missing");
  if (!moodleUpsert || moodleUpsert.options?.onConflict !== "dedupe_key") throw new Error("moodle upsert conflict key missing");
});
