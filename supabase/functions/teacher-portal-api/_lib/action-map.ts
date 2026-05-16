import type { ActionContext } from "./types.ts";
import { approveAvailabilityAction } from "../_actions/approve-availability.ts";
import { getApplicantsForClassAction } from "../_actions/get-applicants-for-class.ts";
import { getClassOptionsForTeacherAction } from "../_actions/get-class-options-for-teacher.ts";
import { getMilestoneDefinitionsAction } from "../_actions/get-milestone-definitions.ts";
import { getMilestonesForSessionAction } from "../_actions/get-milestones-for-session.ts";
import { getStudentMilestonesForClassAction } from "../_actions/get-student-milestones-for-class.ts";
import { getTeacherActiveClassOptionsAction } from "../_actions/get-teacher-active-class-options.ts";
import { getTeacherAssignmentsAction } from "../_actions/get-teacher-assignments.ts";
import { getTeacherAvailabilityHistoryAction } from "../_actions/get-teacher-availability-history.ts";
import { getTeacherCampusOptionsAction } from "../_actions/get-teacher-campus-options.ts";
import { getTeacherClassProgressGridAction } from "../_actions/get-teacher-class-progress-grid.ts";
import { loadAttendanceRosterAction } from "../_actions/load-attendance-roster.ts";
import { lookupTeacherForAttendanceAction } from "../_actions/lookup-teacher-for-attendance.ts";
import { searchAttendancePersonAction } from "../_actions/search-attendance-person.ts";
import { submitLegacyAttendanceAction } from "../_actions/submit-legacy-attendance.ts";
import { submitLegacyMilestonesAction } from "../_actions/submit-legacy-milestones.ts";
import { submitSessionOutcomesAction } from "../_actions/submit-session-outcomes.ts";
import { submitTeacherAttendanceAction } from "../_actions/submit-teacher-attendance.ts";
import { submitTeacherAvailabilityAction } from "../_actions/submit-teacher-availability.ts";
import { createTeacherDirectAction } from "../_actions/create-teacher-direct.ts";
import { updateStudentMilestoneAction } from "../_actions/update-student-milestone.ts";

export type ActionHandler = (ctx: ActionContext) => Promise<Response>;

export const actionMap: Record<string, ActionHandler> = {
  lookupTeacherForAttendance: lookupTeacherForAttendanceAction,
  getTeacherActiveClassOptions: getTeacherActiveClassOptionsAction,
  loadAttendanceRoster: loadAttendanceRosterAction,
  searchAttendancePerson: searchAttendancePersonAction,
  getTeacherClassProgressGrid: getTeacherClassProgressGridAction,
  submitTeacherAttendance: submitTeacherAttendanceAction,
  getMilestonesForSession: getMilestonesForSessionAction,
  submitSessionOutcomes: submitSessionOutcomesAction,
  submitTeacherAvailability: submitTeacherAvailabilityAction,
  getTeacherCampusOptions: getTeacherCampusOptionsAction,
  getTeacherAvailabilityHistory: getTeacherAvailabilityHistoryAction,
  approveAvailability: approveAvailabilityAction,
  getTeacherAssignments: getTeacherAssignmentsAction,
  getClassOptionsForTeacher: getClassOptionsForTeacherAction,
  getApplicantsForClass: getApplicantsForClassAction,
  getMilestoneDefinitions: getMilestoneDefinitionsAction,
  getStudentMilestonesForClass: getStudentMilestonesForClassAction,
  submitLegacyAttendance: submitLegacyAttendanceAction,
  submitLegacyMilestones: submitLegacyMilestonesAction,
  createTeacherDirect: createTeacherDirectAction,
  updateStudentMilestone: updateStudentMilestoneAction,
};
