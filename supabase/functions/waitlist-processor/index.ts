import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  safeLogAudit,
  withTimeout,
} from "../_shared/http.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOODLE_URL       = "https://rocksolid.lwcanada.org";
const MAX_PROMOTIONS   = 50;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

interface Slot {
  class_slot_id: string;
  class_option_id: string;
  batch_id: string;
  max_capacity: number | null;
  current_enrolment: number;
}

interface RunResults {
  promoted:      number;
  slots_checked: number;
  emails_queued: number;
  errors:        string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getClassInfo(classOptionId: string) {
  const { data } = await sb
    .from("class_options")
    .select("teacher_name,day,class_time")
    .eq("class_option_id", classOptionId)
    .limit(1)
    .maybeSingle();
  return data as { teacher_name: string | null; day: string | null; class_time: string | null } | null;
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

// ── Promotion logic for one slot ──────────────────────────────────────────────

async function promoteSlot(
  slot:    Slot,
  results: RunResults,
  budget:  number,
): Promise<number> {
  const available = slot.max_capacity != null
    ? slot.max_capacity - slot.current_enrolment
    : 9999;
  if (available <= 0) return 0;

  const classInfo = await getClassInfo(slot.class_option_id);
  let promoted  = 0;
  let remaining = Math.min(available, budget);

  while (remaining > 0) {
    const { data: applicant } = await sb
      .from("applicants")
      .select("id,full_name,email,fellowship_code,class_option_id,batch_id")
      .eq("class_option_id", slot.class_option_id)
      .eq("batch_id",         slot.batch_id)
      .eq("registration_status", "WAITLISTED")
      .order("waitlisted_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!applicant) break;

    const now          = new Date().toISOString();
    const newEnrolment = slot.current_enrolment + promoted + 1;

    // Assign — guard against race with eq on registration_status
    const { error: assignErr } = await sb
      .from("applicants")
      .update({ registration_status: "ASSIGNED", assigned_at: now })
      .eq("id", applicant.id)
      .eq("registration_status", "WAITLISTED");

    if (assignErr) {
      results.errors.push(`assign ${applicant.id}: ${assignErr.message}`);
      break;
    }

    // Increment slot enrolment
    await sb
      .from("class_slots")
      .update({ current_enrolment: newEnrolment })
      .eq("class_slot_id", slot.class_slot_id);

    // Upsert moodle sync
    await sb.from("moodle_enrollment_sync").upsert(
      {
        email:           applicant.email,
        full_name:       applicant.full_name,
        batch_id:        slot.batch_id,
        class_option_id: slot.class_option_id,
        applicant_id:    applicant.id,
        sync_status:     "PENDING",
      },
      { onConflict: "email,batch_id" },
    );

    // Queue promotion email
    const firstName       = String(applicant.full_name || "Student").split(/\s+/)[0];
    const spotsRemaining  = (slot.max_capacity ?? 9999) - newEnrolment;
    await sb.from("email_queue").insert({
      recipient_email: applicant.email,
      recipient_name:  applicant.full_name || "",
      template_key:    "waitlist_promoted",
      subject:         "Great news — you have been assigned to a Foundation School class!",
      status:          "Pending",
      payload: {
        first_name:      firstName,
        full_name:       applicant.full_name,
        email:           applicant.email,
        class_time:      classInfo?.class_time || "",
        teacher_name:    classInfo?.teacher_name || "",
        class_day:       classInfo?.day || "",
        fellowship_code: applicant.fellowship_code || "",
        batch_id:        slot.batch_id,
        class_option_id: slot.class_option_id,
        moodle_url:      MOODLE_URL,
      },
    });

    // Audit
    await safeLogAudit(sb, {
      actor_email: "waitlist-processor@system",
      action:      "WAITLIST_PROMOTED",
      entity_type: "applicant",
      entity_id:   applicant.id,
      status:      "SUCCESS",
      details: {
        class_option_id: slot.class_option_id,
        batch_id:        slot.batch_id,
        spots_remaining: spotsRemaining,
      },
    });

    promoted++;
    remaining--;
  }

  results.promoted      += promoted;
  results.emails_queued += promoted;
  return promoted;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as {
      action?:          string;
      class_option_id?: string;
      batch_id?:        string;
      applicant_id?:    string;
    };

    const results: RunResults = { promoted: 0, slots_checked: 0, emails_queued: 0, errors: [] };

    // Decrement slot if a specific applicant was inactivated
    if (body.applicant_id) {
      const { data: app } = await sb
        .from("applicants")
        .select("class_option_id,batch_id")
        .eq("id", body.applicant_id)
        .maybeSingle();
      if (app?.class_option_id && app?.batch_id) {
        await decrementSlot(app.class_option_id, app.batch_id);
        // Now run promotion for that slot
        body.class_option_id = app.class_option_id;
        body.batch_id        = app.batch_id;
      }
    }

    let slots: Slot[] = [];

    if (body.class_option_id && body.batch_id) {
      const { data } = await withTimeout(
        sb
          .from("class_slots")
          .select("class_slot_id,class_option_id,batch_id,max_capacity,current_enrolment")
          .eq("class_option_id", body.class_option_id)
          .eq("batch_id",        body.batch_id)
          .eq("status",          "Active")
          .limit(1),
        10000,
      );
      slots = (data as Slot[]) || [];
    } else {
      // All active slots in active batches
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
            .eq("status",  "Active")
            .limit(200),
          15000,
        );
        slots = (data as Slot[]) || [];
      }
    }

    results.slots_checked = slots.length;
    let budget = MAX_PROMOTIONS - results.promoted;

    for (const slot of slots) {
      if (budget <= 0) break;
      const n = await promoteSlot(slot, results, budget);
      budget -= n;
    }

    return jsonResponse({ ok: true, ...results });
  } catch (err) {
    console.error("WAITLIST_PROCESSOR_ERROR", err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});

