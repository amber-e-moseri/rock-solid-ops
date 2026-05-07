function installAllTriggers() {
  // Google Form registration/application flow disabled.
  // External website flow is now the source of truth.
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  if (typeof phase3_installTriggers === 'function') phase3_installTriggers();
  ScriptApp.newTrigger('ft_runDailyFlagCheck').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('pool_runDailyCheck').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('transition_runDailyCheck').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('buildGroupSummary').timeBased().everyDays(1).atHour(6).create();
  if (typeof setupTeacherAvailTriggers === 'function') setupTeacherAvailTriggers();
  if (typeof cleanupNonAttendanceFormTriggers_ === 'function') cleanupNonAttendanceFormTriggers_();
  if (typeof RUN_ME_installAttendanceFormTriggers === 'function') RUN_ME_installAttendanceFormTriggers();

  logSync_('TRIGGERS', 'Reinstalled all project triggers from scratch');
}

function cleanupNonAttendanceFormTriggers_() {
  const keepHandlers = new Set([
    'onAttendanceFormSubmit',
    'onFormSubmit_Attendance'
  ]);
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    const isFormSubmit = t.getEventType && t.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT;
    if (!isFormSubmit) return;
    const handler = String(t.getHandlerFunction ? t.getHandlerFunction() : '').trim();
    if (keepHandlers.has(handler)) return;
    ScriptApp.deleteTrigger(t);
    removed++;
  });
  logSync_('TRIGGERS', `cleanupNonAttendanceFormTriggers_ removed=${removed}`);
  return { ok: true, removed: removed };
}

function RUN_ME_setupAttendanceOnlyMode() {
  // Google Form registration/application flow disabled.
  // External website flow is now the source of truth.
  if (typeof schema_migrateAll === 'function') schema_migrateAll();
  if (typeof ensureAttendanceFormsSheet_ === 'function') ensureAttendanceFormsSheet_();
  const cleanup = cleanupNonAttendanceFormTriggers_();
  if (typeof RUN_ME_installAttendanceFormTriggers === 'function') RUN_ME_installAttendanceFormTriggers();
  return { ok: true, mode: 'attendance_only', triggerCleanup: cleanup };
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Foundation School')
    .addSubMenu(ui.createMenu('Setup')
      .addItem('Create / migrate all sheets', 'schema_migrateAll')
      .addItem('Create missing sheet tabs', 'schema_createMissingSheets_')
      .addItem('Validate headers', 'schema_validateHeaders_')
      .addItem('Ensure config guidance', 'ensureConfigGuidance_')
      .addItem('Validate teacher contacts', 'validateTeacherContacts_')
      .addItem('Install all triggers', 'installAllTriggers')
      .addItem('Setup Attendance-Only Mode', 'RUN_ME_setupAttendanceOnlyMode'))
    .addSubMenu(ui.createMenu('Validation')
      .addItem('Validate class options', 'config_validateClassOptions_'))
    .addSubMenu(ui.createMenu('Data')
      .addItem('Process new form responses (Legacy Google Form)', 'phase2_processNewFormResponsesToApplicants')
      .addItem('Sync students from APPLICANTS', 'syncStudentsFromApplicants')
      .addItem('Refresh student progress', 'student_refreshProgressColumns_'))
    .addSubMenu(ui.createMenu('Dashboard')
      .addItem('Refresh dashboard', 'buildAdminDashboard')
      .addItem('Rebuild Group Summary', 'buildGroupSummary')
      .addItem('Prune SYNC_LOG', 'pruneSyncLog'))
    .addSubMenu(ui.createMenu('Moodle')
      .addItem('Setup MOODLE_COURSES sheet', 'setupMoodleCoursesSheet')
      .addItem('Update Course IDs for this month', 'promptUpdateMoodleCourseIDs')
      .addItem('Clear all Course IDs', 'clearMoodleCourseIDs')
      .addItem('Test Moodle connection', 'testMoodleConnection'))
    // Google Form registration/application flow disabled.
    // External website flow is now the source of truth.
    .addSubMenu(ui.createMenu('Teacher Availability')
      .addItem('Open teacher scheduler', 'openTeacherAvailabilityScheduler')
      .addItem('Sync Approved Slots to CLASS_OPTIONS', 'teacherAvail_syncApprovedToClassOptions')
      .addItem('Send Monthly Teacher Reminder', 'teacherAvail_sendMonthlyReminder')
      .addItem('Send Follow-up Reminder', 'teacherAvail_sendFollowupReminder')
      .addItem('View Submission Gaps', 'teacherAvail_viewSubmissionGaps')
      .addItem('Install Monthly Reminder Trigger', 'teacherAvail_installMonthlyReminderTrigger')
      .addItem('Run TA E2E Checks', 'teacherAvail_runE2EChecks_')
      .addItem('Create availability form for this month', 'createTeacherAvailabilityForm')
      .addItem('Send form to all teachers now', 'teacherAvail_runMonthlyCycle')
      .addItem('Send reminders to non-submitters', 'teacherAvail_sendReminders')
      .addItem('Sync approved -> CLASS_OPTIONS', 'syncAllApprovedToClassOptions_')
      .addItem('Setup availability sheets', 'setupTeacherAvailabilitySheet')
      .addItem('Fix teachers sheet (run once)', 'fixTeachersSheet_')
      .addItem('Reset scheduler setup cache', 'resetSchedulerSetupCache_')
      .addItem('Install availability triggers', 'setupTeacherAvailTriggers'))
    .addSubMenu(ui.createMenu('Phase 4 - Attendance')
      .addItem('Sync attendance form', 'syncAttendanceForm')
      .addItem('Install attendance trigger', 'installAttendanceTrigger')
      .addItem('Apply checkbox formatting', 'fs4_applyCheckboxesToAttendanceCols')
      .addItem('Debug roster', 'fs4_debugRoster'))
    .addSubMenu(ui.createMenu('Graduation')
      .addItem('Run gate check (current batch)', 'grad_runGateCheck_fromMenu')
      .addItem('Build makeup queue', 'grad_buildMakeupQueue_fromMenu'))
    .addToUi();
}
