import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  classifyError,
  validateRequired,
  validateEmail,
  validateErrors,
  isValidPayload,
  safeLogAudit,
} from "../shared-utils/edge-hardening.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const batch_id = String(body.batch_id || "").trim() || null;
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
    console.log("DUPLICATE_CHECK", {
      email,
      existingCount,
      duplicateCount,
      isDuplicate,
    });

    type RegistrationStatus =
      | "PENDING"
      | "ASSIGNED"
      | "WAITLISTED"
      | "DUPLICATE"
      | "REVIEW"
      | "INACTIVE"
      | "COMPLETED";

    type AvailabilityStatus =
      | "CLASS_ASSIGNED"
      | "NO_MATCHING_TIME"
      | "CLASS_FULL"
      | "MANUAL_REVIEW_REQUIRED"
      | "NO_CLASS_AVAILABLE";

    const normalizeBool = (v: unknown) =>
      v === true || String(v ?? "").toLowerCase() === "true";

    const canAutoAssign = !normalizeBool(body.assignment_deferred) && !normalizeBool(body.manual_review_required);

    let registrationStatus: RegistrationStatus = "PENDING";
    let availabilityStatus: AvailabilityStatus = "MANUAL_REVIEW_REQUIRED";
    let classIsFull = false;
    let assignedAt: string | null = null;
    let waitlistedAt: string | null = null;
    let reviewedAt: string | null = null;
    let reviewNotes: string | null = null;

    if (isDuplicate) {
      registrationStatus = "DUPLICATE";
      availabilityStatus = "MANUAL_REVIEW_REQUIRED";
      reviewedAt = nowIso;
      reviewNotes = `Duplicate registration detected. This email has submitted ${duplicateCount} times.`;
    } else if (!canAutoAssign) {
      registrationStatus = "REVIEW";
      availabilityStatus = "MANUAL_REVIEW_REQUIRED";
      reviewedAt = nowIso;
      reviewNotes = "Auto-assignment deferred for manual review.";
    } else if (class_option_id) {
      const { data: classOptionRow, error: classOptionError } = await db
        .from("class_options")
        .select("class_option_id,max_capacity,active,enrollment_open")
        .eq("class_option_id", class_option_id)
        .maybeSingle();

      if (classOptionError) {
        console.error("REGISTRATION_PROCESSOR_CLASS_OPTION_LOAD_ERROR", classOptionError);
        registrationStatus = "REVIEW";
        availabilityStatus = "MANUAL_REVIEW_REQUIRED";
        reviewedAt = nowIso;
        reviewNotes = "Could not safely validate selected class option.";
      } else if (!classOptionRow) {
        registrationStatus = "REVIEW";
        availabilityStatus = "MANUAL_REVIEW_REQUIRED";
        reviewedAt = nowIso;
        reviewNotes = "Selected class option no longer exists.";
      } else {
        const maxCapacity = Number(classOptionRow.max_capacity || 0);
        const { count: assignedCount, error: assignedCountError } = await db
          .from("applicants")
          .select("*", { count: "exact", head: true })
          .eq("class_option_id", class_option_id)
          .eq("registration_status", "ASSIGNED");

        if (assignedCountError) {
          console.error("REGISTRATION_PROCESSOR_CAPACITY_COUNT_ERROR", assignedCountError);
          registrationStatus = "REVIEW";
          availabilityStatus = "MANUAL_REVIEW_REQUIRED";
          reviewedAt = nowIso;
          reviewNotes = "Could not validate class capacity safely.";
        } else {
          classIsFull = maxCapacity > 0 && Number(assignedCount || 0) >= maxCapacity;
          if (classIsFull) {
            registrationStatus = "WAITLISTED";
            availabilityStatus = "CLASS_FULL";
            waitlistedAt = nowIso;
          } else {
            registrationStatus = "ASSIGNED";
            availabilityStatus = "CLASS_ASSIGNED";
            assignedAt = nowIso;
          }
        }
      }
    } else if (availability) {
      registrationStatus = "WAITLISTED";
      availabilityStatus = "NO_MATCHING_TIME";
      waitlistedAt = nowIso;
    } else {
      registrationStatus = "WAITLISTED";
      availabilityStatus = "NO_CLASS_AVAILABLE";
      waitlistedAt = nowIso;
    }

    const legacyStatus =
      registrationStatus === "ASSIGNED"
        ? "Enrolled"
        : registrationStatus === "WAITLISTED"
        ? "Waitlisted"
        : registrationStatus === "DUPLICATE"
        ? "Duplicate"
        : registrationStatus === "REVIEW"
        ? "Review"
        : "Pending";

    const applicantInsertBase = {
      full_name,
      first_name,
      last_name,
      email,
      phone,
      fellowship_code: fellowship_code || null,
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

    let templateKey = "waitlist_confirmation";
    if (registrationStatus === "ASSIGNED") templateKey = "foundation_welcome";
    if (registrationStatus === "DUPLICATE") templateKey = "duplicate_registration";
    if (registrationStatus === "REVIEW") templateKey = "registration_under_review";
    if (registrationStatus === "WAITLISTED" && availabilityStatus === "NO_MATCHING_TIME") templateKey = "no_suitable_times";
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
          : templateKey === "registration_under_review"
          ? "Your registration is under review"
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
