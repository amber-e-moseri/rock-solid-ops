import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders as sharedCorsHeaders,
  jsonResponse,
  classifyError,
  validateRequired,
  validateEmail,
  validateErrors,
  isValidPayload,
  safeLogAudit,
} from "../_shared/http.ts";
import { assignApplicant } from "../_shared/lib/assign-applicant.ts";

const allowedOrigins = [
  "https://rocksolidsuite.netlify.app",
  "https://rocksolid.lwcanada.org",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = String(req.headers.get("origin") || req.headers.get("Origin") || "").trim();
  const matchedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": matchedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  Object.assign(sharedCorsHeaders, corsHeaders);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const db = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );
    const triggerMoodleSync = async (syncId: string) => {
      if (!syncId) return;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/moodle-sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: syncId, limit: 1 }),
        });
        if (!res.ok) {
          const txt = await res.text();
          console.error("REGISTRATION_PROCESSOR_MOODLE_SYNC_TRIGGER_FAILED", {
            syncId,
            status: res.status,
            body: txt,
          });
        }
      } catch (err) {
        console.error("REGISTRATION_PROCESSOR_MOODLE_SYNC_TRIGGER_ERROR", { syncId, err });
      }
    };
    const triggerMailchimpSync = async (contact: {
      email: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      campus?: string;
      fellowship_code?: string;
      template_key?: string;
    }) => {
      const recipientEmail = String(contact?.email || "").trim().toLowerCase();
      if (!recipientEmail) return;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/mailchimp-sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: recipientEmail,
            first_name: contact.first_name || "",
            last_name: contact.last_name || "",
            phone: contact.phone || "",
            campus: contact.campus || "",
            fellowship_code: contact.fellowship_code || "",
            template_key: contact.template_key || "",
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          console.error("REGISTRATION_PROCESSOR_MAILCHIMP_SYNC_TRIGGER_FAILED", {
            recipientEmail,
            status: res.status,
            body: txt,
          });
        }
      } catch (err) {
        console.error("REGISTRATION_PROCESSOR_MAILCHIMP_SYNC_TRIGGER_ERROR", { recipientEmail, err });
      }
    };

    const body = await req.json().catch(() => ({}));
    
    // Input validation
    if (!isValidPayload(body)) {
      return jsonResponse({ ok: false, error: "Invalid payload", code: "INVALID_PAYLOAD", statusCode: 400 }, 400);
    }

    const resolveAdminCaller = async () => {
      const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch?.[1]) return { user: null, isAdmin: false };

      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (!SUPABASE_ANON_KEY) return { user: null, isAdmin: false };
      const authDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${tokenMatch[1].trim()}` } },
      });
      const userRes = await authDb.auth.getUser();
      const user = userRes.data?.user || null;
      if (userRes.error || !user) return { user: null, isAdmin: false };

      const profileRes = await db
        .from("profiles")
        .select("role,is_active")
        .eq("user_id", user.id)
        .maybeSingle();
      const role = String(profileRes.data?.role || "").trim().toLowerCase();
      const isActive = profileRes.data?.is_active !== false;
      const allowed = new Set(["admin", "superadmin"]);
      return { user, isAdmin: Boolean(profileRes.data && isActive && allowed.has(role)) };
    };

    const adminOverrideFields = [
      "registration_status",
      "status",
      "availability_status",
      "assigned_at",
      "waitlisted_at",
      "reviewed_at",
      "review_notes",
      "retry_assignment",
      "assignment_attempts",
      "needs_admin_review",
      "admin_note",
    ];
    const hasAdminOverrideInput = adminOverrideFields.some((k) => Object.prototype.hasOwnProperty.call(body, k));
    if (hasAdminOverrideInput) {
      const caller = await resolveAdminCaller();
      if (!caller.isAdmin) {
        return jsonResponse({ ok: false, error: "Forbidden", code: "FORBIDDEN", statusCode: 403 }, 403);
      }
    }

    const full_name = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const fellowship_code = String(body.fellowship_code || "").trim() || null;
    const class_option_id = String(body.class_option_id || "").trim() || null;
    let batch_id = String(body.batch_id || "").trim() || null;
    const availability = String(body.availability || "").trim() || null;

    // Validate required fields
    const validationErrors = validateErrors(
      validateRequired(full_name, "full_name"),
      validateEmail(email, "email"),
    );

    if (validationErrors.length > 0) {
      return jsonResponse({ 
        ok: false, 
        error: validationErrors.map(e => e.message).join(", "), 
        code: "VALIDATION_ERROR",
        statusCode: 400
      }, 400);
    }

    const nowIso = new Date().toISOString();
    const flowTraceId = crypto.randomUUID();
    const applicantId = crypto.randomUUID();
    const debugTrail: Record<string, unknown> = {
      started_at: nowIso,
      phase: "received",
      trace_id: flowTraceId,
    };

    const first_name = full_name.split(" ")[0] || full_name;
    const last_name = full_name.split(" ").slice(1).join(" ");

    // Duplicate detection is informational only; it must never block registration.
    const { count, error: countError } = await db
      .from("applicants")
      .select("*", { count: "exact", head: true })
      .eq("email", email);

    if (countError) {
      console.error("REGISTRATION_PROCESSOR_DUPLICATE_COUNT_ERROR", countError);
    }

    const existingCount = count || 0;
    const duplicateCount = existingCount + 1;
    const isDuplicate = existingCount > 0;

    let existingSameBatchApplicant: Record<string, unknown> | null = null;
    if (batch_id) {
      const { data: sameBatchApplicant, error: sameBatchError } = await db
        .from("applicants")
        .select("id, registration_status, status, batch_id, email, duplicate_count")
        .eq("email", email)
        .eq("batch_id", batch_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sameBatchError) {
        console.error("REGISTRATION_PROCESSOR_SAME_BATCH_DUPLICATE_CHECK_ERROR", sameBatchError);
      } else {
        existingSameBatchApplicant = sameBatchApplicant as Record<string, unknown> | null;
      }
    }

    const sameBatchStatus = String(
      existingSameBatchApplicant?.registration_status ||
      existingSameBatchApplicant?.status ||
      "",
    ).toUpperCase();
    const forceDuplicateByBatch = Boolean(existingSameBatchApplicant && sameBatchStatus.length > 0);
    const duplicateGuardExistingId = String(existingSameBatchApplicant?.id || "").trim();
    const duplicateGuardReason =
      forceDuplicateByBatch && sameBatchStatus === "DUPLICATE"
        ? "existing_duplicate_in_same_batch"
        : forceDuplicateByBatch
        ? "existing_registration_in_same_batch"
        : "";

    console.log("DUPLICATE_CHECK", {
      email,
      existingCount,
      duplicateCount,
      isDuplicate,
      batchId: batch_id,
      sameBatchExistingId: duplicateGuardExistingId || null,
      sameBatchStatus: sameBatchStatus || null,
      duplicateGuardReason: duplicateGuardReason || null,
    });

    const normalizeBool = (v: unknown) =>
      v === true || String(v ?? "").toLowerCase() === "true";

    const canAutoAssign = !normalizeBool(body.assignment_deferred) && !normalizeBool(body.manual_review_required);
    const assignment = await assignApplicant(applicantId, db, {
      mode: "registration",
      nowIso,
      batch_id,
      class_option_id,
      availability,
      canAutoAssign,
      isDuplicate,
      duplicateCount,
    });
    let registrationStatus = String(assignment.status || "PENDING") as
      | "PENDING"
      | "ASSIGNED"
      | "WAITLISTED"
      | "DUPLICATE"
      | "REVIEW"
      | "INACTIVE"
      | "COMPLETED";
    let availabilityStatus = String(assignment.availabilityStatus || "MANUAL_REVIEW_REQUIRED") as
      | "CLASS_ASSIGNED"
      | "NO_MATCHING_TIME"
      | "NO_SUITABLE_TIME"
      | "CLASS_FULL"
      | "MANUAL_REVIEW_REQUIRED"
      | "NO_CLASS_AVAILABLE";
    const classIsFull = Boolean(assignment.classIsFull);
    const assignedAt = assignment.assignedAt ?? null;
    const waitlistedAt = assignment.waitlistedAt ?? null;
    const reviewedAt = assignment.reviewedAt ?? null;
    let reviewNotes = assignment.reviewNotes ?? null;
    const legacyStatus = String(assignment.legacyStatus || "Pending");
    batch_id = assignment.batchId ?? batch_id;

    if (forceDuplicateByBatch) {
      registrationStatus = "DUPLICATE";
      availabilityStatus = "MANUAL_REVIEW_REQUIRED";
      reviewNotes = duplicateGuardReason === "existing_duplicate_in_same_batch"
        ? "Duplicate registration rejected: email already has DUPLICATE status in this batch."
        : "Duplicate registration rejected: email already registered in this batch.";
    }
    let group_id: string | null = null;
    let subgroup_id: string | null = null;
    if (fellowship_code && fellowship_code.toUpperCase() !== "REGIONAL") {
      const { data: fellowshipRow } = await db
        .from("fellowship_map")
        .select("group_id,subgroup_id")
        .eq("fellowship_code", fellowship_code)
        .eq("active", true)
        .maybeSingle();
      group_id = String(fellowshipRow?.group_id || "").trim() || null;
      subgroup_id = String(fellowshipRow?.subgroup_id || "").trim() || null;
    }

    const applicantInsertBase = {
      id: applicantId,
      full_name,
      first_name,
      last_name,
      email,
      phone,
      fellowship_code: fellowship_code || null,
      group_id,
      subgroup_id,
      class_option_id: class_option_id || null,
      batch_id: batch_id || null,
      availability,
      status: legacyStatus,
      registration_status: registrationStatus,
      availability_status: availabilityStatus,
      assigned_at: assignedAt,
      waitlisted_at: waitlistedAt,
      reviewed_at: reviewedAt,
      review_notes: reviewNotes,
      retry_assignment: registrationStatus === "WAITLISTED",
      assignment_attempts: 1,
      source: "registration_processor",
      raw_payload: body,
    };

    const applicantInsertWithDuplicateFlags = {
      ...applicantInsertBase,
      duplicate_count: duplicateCount,
      needs_admin_review: isDuplicate || registrationStatus === "REVIEW",
      admin_note: reviewNotes,
    };

    let applicant: Record<string, unknown> | null = null;
    let applicantError: unknown = null;
    if (forceDuplicateByBatch && duplicateGuardExistingId) {
      const { data: existingApplicant, error: existingApplicantError } = await db
        .from("applicants")
        .select("*")
        .eq("id", duplicateGuardExistingId)
        .maybeSingle();
      if (existingApplicantError) {
        applicantError = existingApplicantError;
      } else {
        applicant = existingApplicant as Record<string, unknown> | null;
      }
    } else {
      ({
        data: applicant,
        error: applicantError,
      } = await db
        .from("applicants")
        .insert(applicantInsertWithDuplicateFlags)
        .select("*")
        .single());

      if (applicantError) {
        const msg = JSON.stringify(applicantError);
        const duplicateFlagColumnsMissing =
          msg.includes("duplicate_count") ||
          msg.includes("needs_admin_review") ||
          msg.includes("admin_note");

        if (duplicateFlagColumnsMissing) {
          console.error(
            "REGISTRATION_PROCESSOR_SCHEMA_MIGRATION_NEEDED",
            "Add duplicate_count, needs_admin_review, admin_note columns to applicants.",
          );

          ({
            data: applicant,
            error: applicantError,
          } = await db
            .from("applicants")
            .insert(applicantInsertBase)
            .select("*")
            .single());
        }
      }
    }

    if (applicantError) {
      throw new Error(
        (applicantError as { message?: string })?.message ||
        (applicantError as { details?: string })?.details ||
        (applicantError as { hint?: string })?.hint ||
        JSON.stringify(applicantError)
      );
    }

    const insertedApplicant = applicant as { id?: string } | null;
    debugTrail.phase = "applicant_created";
    debugTrail.applicant_id = insertedApplicant?.id || null;
    console.log("APPLICANT_CREATED", {
      applicantId: insertedApplicant?.id,
      email,
      duplicateCount,
    });

    let classDetails: {
      class_option_id?: string;
      class_id?: string;
      teacher_name?: string;
      day?: string;
      class_time?: string;
    } | null = null;

    if (class_option_id) {
      const { data, error } = await db
        .from("class_options")
        .select("class_option_id,class_id,teacher_name,day,class_time")
        .eq("class_option_id", class_option_id)
        .maybeSingle();

      if (error) {
        console.error("REGISTRATION_PROCESSOR_CLASS_LOOKUP_ERROR", error);
      } else {
        classDetails = data;
      }
    }

    let fellowshipDetails: {
      fellowship_code?: string;
      campus_name?: string;
      timezone?: string;
    } | null = null;

    if (fellowship_code) {
      const { data, error } = await db
        .from("fellowship_map")
        .select("fellowship_code,campus_name,timezone")
        .eq("fellowship_code", fellowship_code)
        .maybeSingle();

      if (error) {
        console.error("REGISTRATION_PROCESSOR_FELLOWSHIP_LOOKUP_ERROR", error);
      } else {
        fellowshipDetails = data;
      }
    }

    let templateKey = "";
    if (registrationStatus === "ASSIGNED") templateKey = "foundation_welcome";
    if (registrationStatus === "DUPLICATE") templateKey = "duplicate_registration";
    if (registrationStatus === "PENDING" && availabilityStatus === "NO_SUITABLE_TIME") templateKey = "no_suitable_times";
    if (registrationStatus === "WAITLISTED" && (availabilityStatus === "CLASS_FULL" || availabilityStatus === "NO_CLASS_AVAILABLE")) templateKey = "no_class_available";

    console.log("EMAIL_TEMPLATE_SELECTED", {
      email,
      registrationStatus,
      availabilityStatus,
      templateKey,
    });

    const emailQueuePayload = {
      recipient_email: email,
      recipient_name: full_name,
      template_key: templateKey,
      subject:
        templateKey === "foundation_welcome"
          ? "Welcome to Foundation School"
          : templateKey === "duplicate_registration"
          ? "We received your additional registration"
          : templateKey === "no_suitable_times"
          ? "We are working on a class time for you"
          : templateKey === "no_class_available"
          ? "We are preparing your class placement"
          : "Your Foundation School registration update",
      status: "Pending",
      trace_id: flowTraceId,
      payload: {
        trace_id: flowTraceId,
        first_name,
        last_name,
        full_name,
        email,
        phone,
        duplicate_count: duplicateCount,
        registration_status: registrationStatus,
        availability_status: availabilityStatus,
        fellowship_code,
        class_option_id,
        batch_id,
        campus:
          body.fellowship_name ||
          body.fellowship_code ||
          "",
        class_label:
          body.class_label ||
          "",
        class_time:
          body.class_time ||
          "",
        class_day:
          body.class_day ||
          "",
        class_date:
          body.class_date ||
          body.class_start_date ||
          "",
        teacher_name:
          body.teacher_name ||
          "",
        timezone:
          body.timezone ||
          "",
        availability:
          body.availability || "",
        waitlist_message:
          "We received your registration and are actively working on your placement. You are on our waitlist, and we will update you as soon as a suitable class opens.",
        template_key: templateKey,
      },
    };
    if (templateKey) {
      let emailQueueInsertError: { message?: string } | null = null;
      ({ error: emailQueueInsertError } = await db
        .from("email_queue")
        .insert(emailQueuePayload));
      if (emailQueueInsertError) {
        const emailQueueMsg = JSON.stringify(emailQueueInsertError);
        if (emailQueueMsg.includes("trace_id")) {
          const emailQueueLegacyPayload = { ...emailQueuePayload };
          delete (emailQueueLegacyPayload as Record<string, unknown>).trace_id;
          ({ error: emailQueueInsertError } = await db
            .from("email_queue")
            .insert(emailQueueLegacyPayload));
        }
      }
      if (emailQueueInsertError) {
        console.error("REGISTRATION_PROCESSOR_EMAIL_QUEUE_INSERT_ERROR", emailQueueInsertError);
        throw new Error(
          `Queue insertion failure: ${emailQueueInsertError.message || "email_queue insert failed"}`,
        );
      }
      debugTrail.phase = "email_queued";
      void triggerMailchimpSync({
        email,
        first_name,
        last_name,
        phone,
        campus: String(body.fellowship_name || body.fellowship_code || ""),
        fellowship_code: fellowship_code || "",
        template_key: templateKey,
      });
    }

    let moodleSyncRowId = "";
    if (registrationStatus === "ASSIGNED") {
      try {
        const moodleBaseRow = {
          dedupe_key: `moodle-enroll:${String(insertedApplicant?.id || "")}`,
          trace_id: flowTraceId,
          registration_id: insertedApplicant?.id || null,
          applicant_id: insertedApplicant?.id || null,
          email,
          full_name,
          batch_id: batch_id || null,
          class_option_id: class_option_id || null,
          registration_status: registrationStatus,
          sync_status: "PENDING",
          status: "PENDING",
          payload: {
            trace_id: flowTraceId,
            applicant_id: insertedApplicant?.id,
            email,
            full_name,
            batch_id,
            class_option_id,
            registration_status: registrationStatus,
          },
        };

        let moodleUpsertErr: unknown = null;
        let moodleRow: { id?: string } | null = null;

        ({ data: moodleRow, error: moodleUpsertErr } = await db
          .from("moodle_enrollment_sync")
          .upsert(moodleBaseRow, { onConflict: "dedupe_key" })
          .select("id")
          .single());

        if (moodleUpsertErr) {
          const moodleMsg = JSON.stringify(moodleUpsertErr);
          if (moodleMsg.includes("trace_id")) {
            const moodleLegacyRow = { ...moodleBaseRow };
            delete (moodleLegacyRow as Record<string, unknown>).trace_id;
            const legacyPayload = { ...(moodleLegacyRow.payload as Record<string, unknown>) };
            delete legacyPayload.trace_id;
            moodleLegacyRow.payload = legacyPayload;

            ({ data: moodleRow, error: moodleUpsertErr } = await db
              .from("moodle_enrollment_sync")
              .upsert(moodleLegacyRow, { onConflict: "dedupe_key" })
              .select("id")
              .single());
          }
        }

        if (moodleUpsertErr) throw moodleUpsertErr;
        moodleSyncRowId = String(moodleRow?.id || "");
      } catch (moodleSyncInsertErr) {
        console.error("REGISTRATION_PROCESSOR_MOODLE_SYNC_INSERT_ERROR", moodleSyncInsertErr);
      }

      try {
        await db
          .from("scheduled_notifications")
          .upsert(
            {
              dedupe_key: `moodle-sync:${String(insertedApplicant?.id || "")}`,
              trace_id: flowTraceId,
              recipient_email: email,
              applicant_id: insertedApplicant?.id || null,
              event_type: "MOODLE_SYNC_REQUESTED",
              template_key: "class_assigned",
              status: "PENDING",
              scheduled_for: nowIso,
              payload: {
                trace_id: flowTraceId,
                applicant_id: insertedApplicant?.id,
                email,
                batch_id,
                class_option_id,
                registration_status: registrationStatus,
              },
            },
            { onConflict: "dedupe_key" },
          );
      } catch (moodleQueueErr) {
        console.error("REGISTRATION_PROCESSOR_MOODLE_QUEUE_ERROR", moodleQueueErr);
      }
      if (moodleSyncRowId) {
        await triggerMoodleSync(moodleSyncRowId);
      }
    }

    const writeAudit = async (
      action: string,
      status: "SUCCESS" | "FAILED",
      details: Record<string, unknown>,
    ) => {
      await safeLogAudit(db, {
        actor_email: "registration-processor@system",
        action,
        entity_type: "applicant",
        entity_id: String(applicant?.id || ""),
        status,
        details,
      });
    };

    const commonAuditDetails = {
      trace_id: flowTraceId,
      full_name,
      email,
      fellowship_code,
      class_option_id,
      batch_id,
      availability,
      registration_status: registrationStatus,
      availability_status: availabilityStatus,
      class_is_full: classIsFull,
      template_key: templateKey,
      debug_trail: debugTrail,
    };

    await writeAudit(
      "REGISTRATION_RECEIVED",
      "SUCCESS",
      commonAuditDetails,
    );
    if (registrationStatus === "ASSIGNED") {
      await writeAudit("REGISTRATION_ASSIGNED", "SUCCESS", commonAuditDetails);
      if (moodleSyncRowId) {
        await writeAudit("MOODLE_SYNC_QUEUED", "SUCCESS", {
          ...commonAuditDetails,
          moodle_sync_id: moodleSyncRowId,
        });
      }
    } else if (registrationStatus === "WAITLISTED") {
      await writeAudit("REGISTRATION_WAITLISTED", "SUCCESS", commonAuditDetails);
    } else if (registrationStatus === "INACTIVE") {
      await writeAudit("REGISTRATION_INACTIVE", "SUCCESS", commonAuditDetails);
      // Fire-and-forget: decrement slot and check waitlist for next eligible student
      if (class_option_id && batch_id) {
        void fetch(`${SUPABASE_URL}/functions/v1/waitlist-processor`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            applicant_id:    String(insertedApplicant?.id || ""),
            class_option_id,
            batch_id,
          }),
        }).catch(() => {});
      }
    } else if (registrationStatus === "DUPLICATE") {
      await writeAudit("REGISTRATION_DUPLICATE", "SUCCESS", commonAuditDetails);
    } else if (registrationStatus === "REVIEW") {
      await writeAudit("REGISTRATION_REVIEW", "SUCCESS", commonAuditDetails);
    }

    return jsonResponse({
      ok: true,
      data: {
        applicant_id: String(applicant?.id || ""),
        registration_status: registrationStatus,
        availability_status: availabilityStatus,
        template_key: templateKey,
        debug_trail: debugTrail,
        message: "Registration processed",
      },
      statusCode: 200,
    });

  } catch (error) {
    const c = classifyError(error);
    return jsonResponse({ ok: false, error: c.message, code: c.code, statusCode: c.statusCode }, c.statusCode);
  }
});

