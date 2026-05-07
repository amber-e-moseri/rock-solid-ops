/***************************************
 * 00_Constants.js
 * Constants moved to 00_Config.gs for centralization.
 * This file is deprecated; use 00_Config.gs instead.
 ***************************************/
const SYSTEM_SHEET_EMAIL_TEMPLATES = 'EMAIL_TEMPLATES';

/** Script property key for Phase 2 cursor dedupe */
const PROP_LAST_RESPONSE_ID = 'FS_LAST_PROCESSED_RESPONSE_ID';

/** Teacher roster cadence */
const ROSTER_SEND_MODE = 'DAILY';
const ROSTER_SEND_HOUR = 7;
const ROSTER_SEND_WEEKDAY = 1;

/** Sender behavior */
const SENDER_NAME = 'Foundation School Team';
const REPLY_TO = 'info@lwcanada.org';
const SEND_AS = '';

/** Email / roster type constants */
const EMAIL_TYPE_TEACHER_ROSTER = 'TEACHER_ROSTER';
const ROSTER_SEND_TYPE_T_MINUS_3 = 'T_MINUS_3';
const ROSTER_SEND_TYPE_DAY_OF = 'DAY_OF';

const FS_ADMIN_EMAIL = 'info@lwcanada.org';
