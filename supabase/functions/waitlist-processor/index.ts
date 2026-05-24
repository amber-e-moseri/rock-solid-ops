import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, safeLogAudit, withTimeout } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOODLE_URL = "https://rocksolid.lwcanada.org";
const MAX_PROMOTIONS = 50;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

interface Slot {
  class_slot_id: string;
  class_option_id: string;
  batch_id: string;
  max_capacity: number | null;
  current_enrolment: number;
}

interface RunResults {
  promoted: number;
  slots_checked: number;
  emails_queued: number;
  class_available_notified: number;
  errors: string[];
}

type ClassInfo = {
  teacher_name: string | null;
  day: string | null;
  class_time: string | null;
  fellowship_codes?: string[] | null;
} | null;

async function getClassInfo(classOptionId: string): Promise<ClassInfo> {
  const { data } = await sb
    .from("class_options")
    .select("teacher_name,day,class_time,fellowship_codes")
    .eq("class_option_id", classOptionId)
    .limit(1)
    .maybeSingle();
  return data as ClassInfo;
}

async function decrementSlot(classOptionId: string, batchId: string): Promise<void> {
  const { data: slot } = await sb
    .from("class_slots")
    .select("class_slot_id,current_enrolment")
    .eq("class_option_id", classOptionId)
    .eq("batch_id", batchId)
    .eq("status", "Active")
    .limit(1)
    .maybeSingle();

  if (!slot || (slot.current_enrolment ?? 0) <= 0) return;

  await sb
    .from("class_slots")
    .update({ current_enrolment: slot.current_enrolment - 1 })
    .eq("class_slot_id", slot.class_slot_id);
}

async function notifyClassNowAvailable(slot: Slot, classInfo: ClassInfo, results: RunResults): Promise<number> {
  const classDay = String(classInfo?.day || "").trim();
  const classTime = String(classInfo?.class_time || "").trim();
  const teacherName = String(classInfo?.teacher_name || "").trim();
  const fellowshipCodes = Array.isArray(classInfo?.fellowship_codes)
    ? classInfo!.fellowship_codes!.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

  if (!classDay || !fellowshipCodes.length) return 0;

  const { data: candidates, error } = await sb
    .from("applicants")
    .select("id,full_name,email,fellowship_code,batch_id,availability,availability_status")
    .eq("batch_id", slot.batch_id)
    .eq("availability_status", "NO_SUITABLE_TIME")
    .in("fellowship_code", fellowshipCodes)
    .limit(500);

  if (error) {
    results.errors.push(`class_now_available lookup: ${error.message}`);
    return 0;
  }

  const dayNeedle = classDay.toLowerCase();
  const matched = (candidates || []).filter((c: any) => String(c.availability || "").toLowerCase().includes(dayNeedle));
  if (!matched.length) return 0;

  let notified = 0;
  for (const app of matched) {
    const firstName = String(app.full_name || "Student").split(/\s+/)[0];
    const dedupeKey = `class_now_available:${String(app.id)}:${String(slot.batch_id)}:${String(slot.class_option_id)}`;
    const queueRes = await sb.from("scheduled_notifications").upsert({
      dedupe_key: dedupeKey,
      recipient_email: String(app.email || "").trim().toLowerCase(),
      applicant_id: app.id,
      event_type: "class_now_available",
      template_key: "class_now_available",
      scheduled_for: new Date().toISOString(),
      status: "PENDING",
      payload: {
        first_name: firstName,
        full_name: app.full_name,
        email: app.email,
        class_day: classDay,
        class_time: classTime,
        class_label: `${classDay}${classTime ? ` at ${classTime}` : ""}`,
        teacher_name: teacherName,
        fellowship_code: app.fellowship_code || "",
        class_option_id: slot.class_option_id,
        batch_id: slot.batch_id,
        moodle_url: MOODLE_URL,
      },
    }, { onConflict: "dedupe_key" });

    if (queueRes.error) {
      results.errors.push(`class_now_available queue ${app.id}: ${queueRes.error.message}`);
      continue;
    }

    await sb
      .from("applicants")
      .update({ availability_status: "CLASS_AVAILABLE", updated_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("availability_status", "NO_SUITABLE_TIME");

    await safeLogAudit(sb, {
      actor_email: "waitlist-processor@system",
      action: "CLASS_NOW_AVAILABLE_NOTIFIED",
      entity_type: "applicant",
      entity_id: app.id,
      status: "SUCCESS",
      details: { class_option_id: slot.class_option_id, batch_id: slot.batch_id, class_day: classDay, class_time: classTime },
    });

    notified += 1;
  }

  results.class_available_notified += notified;
  return notified;
}

async function promoteSlot(slot: Slot, classInfo: ClassInfo, results: RunResults, budget: number): Promise<number> {
  const available = slot.max_capacity != null ? slot.max_capacity - slot.current_enrolment : 9999;
  if (available <= 0) return 0;

  let promoted = 0;
  let remaining = Math.min(available, budget);

  while (remaining > 0) {
    const { data: applicant } = await sb
      .from("applicants")
      .select("id,full_name,email,fellowship_code,class_option_id,batch_id")
      .eq("class_option_id", slot.class_option_id)
      .eq("batch_id", slot.batch_id)
      .eq("registration_status", "WAITLISTED")
      .order("waitlisted_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!applicant) break;

    const now = new Date().toISOString();
    const newEnrolment = slot.current_enrolment + promoted + 1;

    const { error: assignErr } = await sb
      .from("applicants")
      .update({ registration_status: "ASSIGNED", assigned_at: now })
      .eq("id", applicant.id)
      .eq("registration_status", "WAITLISTED");

    if (assignErr) {
      results.errors.push(`assign ${applicant.id}: ${assignErr.message}`);
      break;
    }

    await sb
      .from("class_slots")
      .update({ current_enrolment: newEnrolment })
      .eq("class_slot_id", slot.class_slot_id);

    await sb.from("moodle_enrollment_sync").upsert(
      {
        email: applicant.email,
        full_name: applicant.full_name,
        batch_id: slot.batch_id,
        class_option_id: slot.class_option_id,
        applicant_id: applicant.id,
        sync_status: "PENDING",
      },
      { onConflict: "email,batch_id" },
    );

    const firstName = String(applicant.full_name || "Student").split(/\s+/)[0];
    const spotsRemaining = (slot.max_capacity ?? 9999) - newEnrolment;
    await sb.from("email_queue").insert({
      recipient_email: applicant.email,
      recipient_name: applicant.full_name || "",
      template_key: "waitlist_promoted",
      subject: "Great news - you have been assigned to a Foundation School class!",
      status: "Pending",
      payload: {
        first_name: firstName,
        full_name: applicant.full_name,
        email: applicant.email,
        class_time: classInfo?.class_time || "",
        teacher_name: classInfo?.teacher_name || "",
        class_day: classInfo?.day || "",
        fellowship_code: applicant.fellowship_code || "",
        batch_id: slot.batch_id,
        class_option_id: slot.class_option_id,
        moodle_url: MOODLE_URL,
      },
    });

    await safeLogAudit(sb, {
      actor_email: "waitlist-processor@system",
      action: "WAITLIST_PROMOTED",
      entity_type: "applicant",
      entity_id: applicant.id,
      status: "SUCCESS",
      details: { class_option_id: slot.class_option_id, batch_id: slot.batch_id, spots_remaining: spotsRemaining },
    });

    promoted++;
    remaining--;
  }

  results.promoted += promoted;
  results.emails_queued += promoted;
  return promoted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as {
      action?: string;
      class_option_id?: string;
      batch_id?: string;
      applicant_id?: string;
    };

    const results: RunResults = {
      promoted: 0,
      slots_checked: 0,
      emails_queued: 0,
      class_available_notified: 0,
      errors: [],
    };

    if (body.applicant_id) {
      const { data: app } = await sb
        .from("applicants")
        .select("class_option_id,batch_id")
        .eq("id", body.applicant_id)
        .maybeSingle();
      if (app?.class_option_id && app?.batch_id) {
        await decrementSlot(app.class_option_id, app.batch_id);
        body.class_option_id = app.class_option_id;
        body.batch_id = app.batch_id;
      }
    }

    let slots: Slot[] = [];

    if (body.class_option_id && body.batch_id) {
      const { data } = await withTimeout(
        sb
          .from("class_slots")
          .select("class_slot_id,class_option_id,batch_id,max_capacity,current_enrolment")
          .eq("class_option_id", body.class_option_id)
          .eq("batch_id", body.batch_id)
          .eq("status", "Active")
          .limit(1),
        10000,
      );
      slots = (data as Slot[]) || [];
    } else {
      const { data: batches } = await withTimeout(
        sb.from("batches").select("batch_id").eq("active", true).limit(20),
        10000,
      );
      const batchIds = ((batches as { batch_id: string }[]) || []).map((b) => b.batch_id);
      if (batchIds.length) {
        const { data } = await withTimeout(
          sb
            .from("class_slots")
            .select("class_slot_id,class_option_id,batch_id,max_capacity,current_enrolment")
            .in("batch_id", batchIds)
            .eq("status", "Active")
            .limit(200),
          15000,
        );
        slots = (data as Slot[]) || [];
      }
    }

    results.slots_checked = slots.length;
    let budget = MAX_PROMOTIONS - results.promoted;

    for (const slot of slots) {
      const classInfo = await getClassInfo(slot.class_option_id);
      await notifyClassNowAvailable(slot, classInfo, results);
      if (budget <= 0) continue;
      const n = await promoteSlot(slot, classInfo, results, budget);
      budget -= n;
    }

    return jsonResponse({ ok: true, ...results });
  } catch (err) {
    console.error("WAITLIST_PROCESSOR_ERROR", err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
