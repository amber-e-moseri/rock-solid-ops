import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, safeLogAudit, withTimeout } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOODLE_URL = "https://rocksolid.lwcanada.org";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

interface Slot {
  class_slot_id: string;
  class_option_id: string;
  batch_id: string;
  max_capacity: number | null;
  current_enrolment: number;
}

interface RunResults {
  slots_checked: number;
  notified: number;
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

  results.notified += notified;
  return notified;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as {
      class_option_id?: string;
      batch_id?: string;
    };

    const results: RunResults = {
      slots_checked: 0,
      notified: 0,
      errors: [],
    };

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

    for (const slot of slots) {
      const classInfo = await getClassInfo(slot.class_option_id);
      await notifyClassNowAvailable(slot, classInfo, results);
    }

    return jsonResponse({ ok: true, ...results });
  } catch (err) {
    console.error("WAITLIST_PROCESSOR_ERROR", err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
