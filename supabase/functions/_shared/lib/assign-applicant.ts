export type AssignResult = {
  status: string;
  classId: string | null;
  availabilityStatus: string;
  batchId?: string | null;
  classIsFull?: boolean;
  assignedAt?: string | null;
  waitlistedAt?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  legacyStatus?: string;
  groupId?: string | null;
  subgroupId?: string | null;
  studentId?: string | null;
  handled?: string | null;
};

type AnyClient = any;
type AnyCtx = Record<string, any>;

async function resolveActiveBatchId(db: AnyClient): Promise<string> {
  const { data: activeBatch, error: batchErr } = await db
    .from("batches")
    .select("batch_id")
    .or("active.eq.true,registration_open.eq.true")
    .eq("archived", false)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (batchErr) throw batchErr;
  return String(activeBatch?.batch_id || "").trim();
}

async function assignForRegistration(applicantId: string, db: AnyClient, ctx: AnyCtx): Promise<AssignResult> {
  const nowIso = String(ctx.nowIso || new Date().toISOString());
  let batch_id = String(ctx.batch_id || "").trim() || null;
  const class_option_id = String(ctx.class_option_id || "").trim() || null;
  const availability = String(ctx.availability || "").trim() || null;
  const canAutoAssign = Boolean(ctx.canAutoAssign);
  const isDuplicate = Boolean(ctx.isDuplicate);
  const duplicateCount = Number(ctx.duplicateCount || 0);

  let registrationStatus = "PENDING";
  let availabilityStatus = "MANUAL_REVIEW_REQUIRED";
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
          if (!batch_id && class_option_id) {
            const activeBatchId = await resolveActiveBatchId(db);
            if (!activeBatchId) {
              console.warn("REGISTRATION_PROCESSOR_NO_ACTIVE_BATCH_FOUND");
            } else {
              const { data: slotRow } = await db
                .from("class_slots")
                .select("batch_id")
                .eq("class_option_id", class_option_id)
                .eq("batch_id", activeBatchId)
                .eq("status", "Active")
                .maybeSingle();
              if (slotRow?.batch_id) batch_id = slotRow.batch_id;
            }
          }
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

  return {
    status: registrationStatus,
    classId: class_option_id,
    availabilityStatus,
    batchId: batch_id,
    classIsFull,
    assignedAt,
    waitlistedAt,
    reviewedAt,
    reviewNotes,
    legacyStatus,
  };
}

async function assignForPhase2(applicantId: string, db: AnyClient, ctx: AnyCtx): Promise<AssignResult> {
  const applicant = ctx.applicant || {};
  const traceId = String(ctx.flowTraceId || "").trim();
  const logSync = ctx.logSync as ((phase: string, message: string, details?: Record<string, unknown>) => Promise<void>) | undefined;
  const insertErrorSubmission = ctx.insertErrorSubmission as ((sourceId: string, message: string, raw: Record<string, unknown>) => Promise<void>) | undefined;

  const activeBatchId = await resolveActiveBatchId(db);
  if (!activeBatchId) {
    if (insertErrorSubmission) {
      await insertErrorSubmission(
        applicantId,
        "No active or open batch found",
        { applicant_id: applicantId, email: applicant.email, trace_id: traceId },
      );
    }
    if (logSync) await logSync("PHASE2_NO_ACTIVE_BATCH", `No active/open batch for applicant ${applicantId}`, { trace_id: traceId });
    return { status: "WAITLISTED", classId: null, availabilityStatus: "NO_CLASS_AVAILABLE", handled: "error_submission" };
  }

  const fellowshipCode = String(applicant.fellowship_code ?? "").trim().toUpperCase();
  if (!fellowshipCode) {
    if (insertErrorSubmission) {
      await insertErrorSubmission(
        applicantId,
        "Missing fellowship_code",
        { applicant_id: applicantId, email: applicant.email, trace_id: traceId },
      );
    }
    if (logSync) await logSync("PHASE2_NO_FELLOWSHIP_CODE", `Applicant ${applicantId} has no fellowship_code`, { trace_id: traceId });
    return { status: "WAITLISTED", classId: null, availabilityStatus: "NO_CLASS_AVAILABLE", handled: "error_submission" };
  }

  const { data: fellowship, error: fmErr } = await db
    .from("fellowship_map")
    .select("fellowship_code, campus_name, group_id, subgroup_id")
    .eq("fellowship_code", fellowshipCode)
    .eq("active", true)
    .single();

  if (fmErr || !fellowship) {
    if (insertErrorSubmission) {
      await insertErrorSubmission(
        applicantId,
        `Fellowship not found: ${fellowshipCode}`,
        { applicant_id: applicantId, fellowship_code: fellowshipCode, trace_id: traceId },
      );
    }
    if (logSync) await logSync("PHASE2_FELLOWSHIP_NOT_FOUND", `No active fellowship: ${fellowshipCode}`, { trace_id: traceId });
    return { status: "WAITLISTED", classId: null, availabilityStatus: "NO_CLASS_AVAILABLE", handled: "error_submission" };
  }

  const groupId = fellowship.group_id;
  const subgroupId = fellowship.subgroup_id;
  const { data: classOptions, error: coErr } = await db
    .from("class_options")
    .select(`
      class_option_id,
      teacher_id,
      teacher_name,
      class_slots (
        class_slot_id,
        batch_id,
        current_enrolment,
        max_capacity,
        status
      )
    `)
    .contains("fellowship_codes", [fellowshipCode])
    .eq("active", true)
    .eq("enrollment_open", true)
    .is("deleted_at", null);
  if (coErr) throw coErr;

  const candidates: Array<{ class_option_id: string; teacher_name: string | null; class_slot_id: string; batch_id: string; current_enrolment: number }> = [];
  for (const co of classOptions ?? []) {
    for (const slot of co.class_slots ?? []) {
      if (slot.status !== "Active") continue;
      if (slot.batch_id !== activeBatchId) continue;
      if (slot.max_capacity !== null && slot.current_enrolment >= slot.max_capacity) continue;
      candidates.push({
        class_option_id: co.class_option_id,
        teacher_name: co.teacher_name,
        class_slot_id: slot.class_slot_id,
        batch_id: slot.batch_id,
        current_enrolment: slot.current_enrolment,
      });
    }
  }
  candidates.sort((a, b) => a.current_enrolment - b.current_enrolment);
  const best = candidates[0];

  if (!best) {
    if (insertErrorSubmission) {
      await insertErrorSubmission(
        applicantId,
        `No open class for fellowship: ${fellowshipCode} in batch: ${activeBatchId}`,
        { applicant_id: applicantId, fellowship_code: fellowshipCode, group_id: groupId, batch_id: activeBatchId, trace_id: traceId },
      );
    }
    if (logSync) await logSync("PHASE2_NO_CLASS_FOUND", `No open class for ${fellowshipCode} in batch ${activeBatchId}`, { trace_id: traceId });
    return { status: "WAITLISTED", classId: null, availabilityStatus: "NO_CLASS_AVAILABLE", handled: "error_submission" };
  }

  const { error: updateApplicantErr } = await db
    .from("applicants")
    .update({
      group_id: groupId,
      class_option_id: best.class_option_id,
      batch_id: activeBatchId,
      status: "Approved",
    })
    .eq("id", applicantId);
  if (updateApplicantErr) throw updateApplicantErr;

  const { count: existingCount, error: countErr } = await db
    .from("students")
    .select("*", { count: "exact", head: true })
    .like("student_id", `FS-${groupId}-%`);
  if (countErr) throw countErr;

  const seq = (existingCount ?? 0) + 1;
  const studentId = `FS-${groupId}-${String(seq).padStart(5, "0")}`;
  const fullName = [applicant.first_name, applicant.last_name].filter(Boolean).join(" ");

  const { error: studentErr } = await db
    .from("students")
    .insert({
      student_id: studentId,
      full_name: fullName,
      email: applicant.email,
      phone: applicant.phone ?? null,
      group_id: groupId,
      subgroup_id: subgroupId,
      fellowship_code: fellowshipCode,
      batch_id: best.batch_id,
      class_option_id: best.class_option_id,
      teacher_name: best.teacher_name ?? null,
      status: "Active",
      eligible_for_fs: false,
    });
  if (studentErr) throw studentErr;

  const { error: rosterErr } = await db
    .from("class_roster")
    .insert({
      student_id: studentId,
      class_option_id: best.class_option_id,
      batch_id: best.batch_id,
      group_id: groupId,
      subgroup_id: subgroupId,
      status: "Active",
    });
  if (rosterErr) throw rosterErr;

  await db
    .from("class_slots")
    .update({ current_enrolment: best.current_enrolment + 1 })
    .eq("class_slot_id", best.class_slot_id);

  return {
    status: "ASSIGNED",
    classId: best.class_option_id,
    availabilityStatus: "CLASS_ASSIGNED",
    batchId: activeBatchId,
    groupId,
    subgroupId,
    studentId,
  };
}

export async function assignApplicant(applicantId: string, supabaseClient: AnyClient, auditContext: AnyCtx): Promise<AssignResult> {
  const mode = String(auditContext?.mode || "").trim().toLowerCase();
  if (mode === "phase2") {
    return assignForPhase2(applicantId, supabaseClient, auditContext);
  }
  return assignForRegistration(applicantId, supabaseClient, auditContext);
}

