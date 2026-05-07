/***************************************
 * 00_Config.gs
 *
 * Central config file for all constants.
 * All other files reference these directly.
 ***************************************/

// GROUPS
const GROUPS = ['CE', 'CS', 'WS'];

// SHEET NAMES
const SHEET_CLASS_OPTIONS = 'CLASS_OPTIONS';
const SHEET_STUDENTS = 'STUDENTS';
const SHEET_ATTENDANCE_LOG = 'ATTENDANCE_LOG';
const SHEET_ATTENDANCE_FORMS = 'ATTENDANCE_FORMS';
const SHEET_FELLOWSHIP_MAP_ = 'FELLOWSHIP_MAP';
const SHEET_FORM_SECTIONS = 'FORM_SECTIONS';
const SHEET_APPLICANTS = 'APPLICANTS';
const SHEET_ERROR_SUBMISSIONS = 'ERROR_SUBMISSIONS';
const SHEET_CLASS_ROSTER = 'CLASS_ROSTER';
const SHEET_TEACHERS = 'TEACHERS';
const SHEET_EMAIL_QUEUE = 'EMAIL_QUEUE';
const SHEET_EMAIL_TEMPLATES_LOCAL = 'EMAIL_TEMPLATES';
const SHEET_TEACHER_ROSTER_LOG = 'TEACHER_ROSTER_LOG';

// FORM LABELS
const PHASE1_NONE_OPTION_ = 'None of these times work for me';
const PHASE1_SECTION_QUESTION_TITLE_ = 'Which class would you like to join?';
const PHASE1_ENTRY_QUESTION_TITLE_ = 'Which fellowship are you from?';
const CAMPUS_QUESTION_TITLE = 'Which campus are you from?';
const FULLNAME_Q_TITLE = 'Full Name';
const EMAIL_Q_TITLE = 'Email';
const PHONE_Q_TITLE = 'Phone Number';
const FIRSTNAME_Q_TITLE = 'First Name';
const LASTNAME_Q_TITLE = 'Last Name';

// SYSTEM
const SYSTEM_TIMEZONE = 'America/Toronto';
const FORM_ID_OR_URL = '1hNpcndgcNrxWwI5ODVVgVpDQsSPTblDzYuEfbuBn4CA';
const SYSTEM_SPREADSHEET_ID = '19SZ0WPvmhXziEnA8tJf132yVuPTNtm15Rx5LXuD4IDQ';
const FOUNDATION_SPREADSHEET_ID = SYSTEM_SPREADSHEET_ID;

// CONFIG FLAGS
const INCLUDE_CLASS_ID_IN_LABEL = false;
const WEEKDAY_NORMALIZE = true;
const SORT_CHOICES = true;
const EMPTY_CHOICE_LABEL = '(No active classes yet)';

// ATTENDANCE FORM CONSTANTS
const ATTENDANCE_FORM_TITLE_PREFIX = 'Foundation School Attendance';
const ATTENDANCE_FORM_DESCRIPTION_TEMPLATE = `GroupID: {GroupID}
SubgroupID: {SubgroupID}
ClassID: {ClassID}
Teacher: {TeacherName}
Day/Time: {Day} {Time}`;

const ATTENDANCE_QUESTIONS = [
  { title: 'Attendance Date', type: 'DATE', required: true },
  { title: 'Class Week', type: 'CHOICE', required: true, options: ['Class1', 'Class2', 'Class3', 'Class4', 'Class5', 'Class6', 'Class7'] },
  { title: 'Students Present', type: 'CHECKBOX', required: false, options: [] } // Dynamic
];

const ATTENDANCE_FORMS_HEADERS = [
  'AttendanceFormID',
  'GroupID',
  'SubgroupID',
  'ClassID',
  'TeacherID',
  'TeacherName',
  'FormID',
  'FormEditUrl',
  'FormPublishedUrl',
  'Active',
  'LastSynced'
];

const ATTENDANCE_LOG_HEADERS = [
  'AttendanceID',
  'StudentID',
  'GroupID',
  'SubgroupID',
  'BatchID',
  'ClassID',
  'TeacherName',
  'ClassWeek',
  'Present',
  'AttendanceDate',
  'SubmittedAt'
];
