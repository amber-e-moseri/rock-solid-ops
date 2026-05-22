-- 202605201000_email_template_headers.sql
-- Standardise all notification_templates and email_templates:
--   Header: logo + "Rock Solid" title + "Foundation School · BLW Canada" subtitle
--   Footer: bg #f5f5f5, "Rock Solid Foundation School · BLW Canada" + "Questions? info@lwcanada.org"
--   Colours: green #16a34a (teacher_approved, teacher_reactivated)
--            purple #4C2A92 (missed_class_checkin, waitlist_promoted, engagement, reminders)
--            navy #1a3c5e (class_assigned, direct_message)
--            dark red #7f1d1d (teacher_rejected, class_slot_cancelled)
--            red #C8102E (everything else)
-- Does NOT change subject lines, placeholder variables, or body content.

-- ================================================================
-- PART A: notification_templates — CSS-class full-HTML templates
-- ================================================================

UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Application Approved</title>
  <style>
    body { margin:0; padding:0; background:#f7f7f7; font-family:'Manrope','DM Sans',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header { background:#16a34a; padding:28px 40px 22px; text-align:center; }
    .header img { display:block; margin:0 auto 8px; }
    .header h1 { margin:0; color:#fff; font-size:24px; font-weight:800; letter-spacing:-.02em; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,.80); font-size:13px; }
    .body { padding:32px 40px; color:#1a1a2e; }
    .body p { margin:0 0 16px; line-height:1.65; font-size:15px; }
    .name { font-weight:800; color:#16a34a; }
    .welcome-box { background:#f0fdf4; border-left:4px solid #16a34a; border-radius:8px; padding:14px 18px; margin:20px 0; font-size:14px; color:#14532d; line-height:1.6; }
    .cta { text-align:center; margin:28px 0; }
    .cta a { display:inline-block; background:#C8102E; color:#fff; text-decoration:none; padding:12px 30px; border-radius:999px; font-weight:800; font-size:14px; }
    .footer { background:#f5f5f5; padding:20px 40px; text-align:center; color:#888; font-size:12px; line-height:1.7; }
    .footer a { color:#888; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Dear <span class="name">{{first_name}}</span>,</p>
      <p>We are thrilled to let you know that your application to serve as a teacher at Rock Solid Foundation School has been <strong>approved</strong>!</p>
      <div class="welcome-box">
        <strong>Welcome to the team!</strong><br />
        Your account is now active. You can log in to the teacher portal to access your dashboard, class schedule, and student roster.
      </div>
      <p>Thank you for your commitment to serving in the Kingdom. Your contribution to the growth of our students is greatly valued.</p>
      <div class="cta">
        <a href="https://rocksolidsuite.netlify.app/foundation/auth/login.html">Log In to Teacher Portal</a>
      </div>
      <p style="font-size:13px;color:#555;">
        God bless you,<br />
        <strong>The Rock Solid Foundation School Team</strong><br />
        BLW Canada
      </p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'teacher_approved';

-- teacher_rejected — dark red #7f1d1d
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Application Update</title>
  <style>
    body { margin:0; padding:0; background:#f7f7f7; font-family:'Manrope','DM Sans',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header { background:#7f1d1d; padding:28px 40px 22px; text-align:center; }
    .header img { display:block; margin:0 auto 8px; }
    .header h1 { margin:0; color:#fff; font-size:24px; font-weight:800; letter-spacing:-.02em; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,.80); font-size:13px; }
    .body { padding:32px 40px; color:#1a1a2e; }
    .body p { margin:0 0 16px; line-height:1.65; font-size:15px; }
    .name { font-weight:800; color:#7f1d1d; }
    .reason-box { background:#fff5f5; border-left:4px solid #C8102E; border-radius:8px; padding:14px 18px; margin:20px 0; font-size:14px; color:#7f1d1d; line-height:1.6; }
    .cta { text-align:center; margin:28px 0; }
    .cta a { display:inline-block; background:#C8102E; color:#fff; text-decoration:none; padding:12px 30px; border-radius:999px; font-weight:800; font-size:14px; }
    .footer { background:#f5f5f5; padding:20px 40px; text-align:center; color:#888; font-size:12px; line-height:1.7; }
    .footer a { color:#888; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Dear <span class="name">{{first_name}}</span>,</p>
      <p>Thank you for your interest in serving as a teacher at Rock Solid Foundation School. After careful review, we are unable to approve your application at this time.</p>
      {{#reason}}
      <div class="reason-box">
        <strong>Feedback from the administration team:</strong><br />{{reason}}
      </div>
      {{/reason}}
      <p>We encourage you to stay connected with your fellowship and continue growing. If you have questions, please reach out to your administrator directly.</p>
      <div class="cta">
        <a href="mailto:foundation@lwcanada.org">Contact Administration</a>
      </div>
      <p style="font-size:13px;color:#555;">
        God bless you,<br />
        <strong>The Rock Solid Foundation School Team</strong><br />
        BLW Canada
      </p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'teacher_rejected';

-- missed_class_checkin — purple #4C2A92
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>We missed you at Foundation School</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f3ff; font-family: 'Manrope', 'DM Sans', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(76,42,146,.10); }
    .header { background: #4C2A92; padding: 28px 40px 22px; text-align: center; }
    .header img { display: block; margin: 0 auto 8px; }
    .header h1 { margin: 0; color: #fff; font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,.80); font-size: 13px; }
    .body { padding: 32px 40px; color: #1a1a2e; }
    .body p { margin: 0 0 16px; line-height: 1.65; font-size: 15px; }
    .body .name { font-weight: 800; color: #4C2A92; }
    .detail-box { background: #f5f3ff; border-left: 4px solid #4C2A92; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 14px; color: #3d2080; line-height: 1.6; }
    .cta { text-align: center; margin: 28px 0; }
    .cta a { display: inline-block; background: #4C2A92; color: #fff; text-decoration: none; padding: 13px 32px; border-radius: 999px; font-weight: 800; font-size: 15px; letter-spacing: .01em; }
    .footer { background: #f5f5f5; padding: 20px 40px; text-align: center; color: #888; font-size: 12px; line-height: 1.7; }
    .footer a { color: #888; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Hi <span class="name">{{first_name}}</span>,</p>
      <p>We noticed you weren't with us at the last Foundation School session and we just wanted to check in — you are missed!</p>
      <div class="detail-box">
        <strong>Your class:</strong> {{class_time}}<br />
        <strong>Your teacher:</strong> {{teacher_name}}
      </div>
      <p>We know life gets busy, and we completely understand. Foundation School is a journey, and every session counts toward building a strong foundation in your walk with God.</p>
      <p>If there's anything going on or if you need any support, please don't hesitate to reach out — we are here for you.</p>
      <p>We'd love to see you at the next session. You belong here!</p>
      <div class="cta">
        <a href="mailto:foundation@lwcanada.org">Get in Touch</a>
      </div>
      <p>With love,<br /><strong>The Rock Solid Foundation School Team</strong><br />BLW Canada</p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'missed_class_checkin';

-- batch_rollover_notice — red #C8102E
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>New Batch Starting</title>
  <style>
    body { margin:0; padding:0; background:#f7f7f7; font-family:'Manrope','DM Sans',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header { background:#C8102E; padding:28px 40px 22px; text-align:center; }
    .header img { display:block; margin:0 auto 8px; }
    .header h1 { margin:0; color:#fff; font-size:24px; font-weight:800; letter-spacing:-.02em; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,.80); font-size:13px; }
    .body { padding:32px 40px; color:#1a1a2e; }
    .body p { margin:0 0 16px; line-height:1.65; font-size:15px; }
    .name { font-weight:800; color:#C8102E; }
    .info-box { background:#fff0f0; border-left:4px solid #C8102E; border-radius:8px; padding:14px 18px; margin:20px 0; font-size:14px; color:#7f1d1d; line-height:1.6; }
    .cta { text-align:center; margin:28px 0; }
    .cta a { display:inline-block; background:#C8102E; color:#fff; text-decoration:none; padding:12px 30px; border-radius:999px; font-weight:800; font-size:14px; }
    .footer { background:#f5f5f5; padding:20px 40px; text-align:center; color:#888; font-size:12px; line-height:1.7; }
    .footer a { color:#888; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Dear <span class="name">{{first_name}}</span>,</p>
      <p>Exciting news — a new Foundation School batch is beginning and you have been enrolled!</p>
      <div class="info-box">
        <strong>New Batch: {{new_batch_name}}</strong><br />
        Start Date: {{start_date}}<br />
        Your Class: {{class_day}} at {{class_time}} with {{teacher_name}}
      </div>
      {{#announcement}}
      <p>{{announcement}}</p>
      {{/announcement}}
      <p>We look forward to an amazing term with you. Stay blessed and keep growing!</p>
      <div class="cta">
        <a href="https://rocksolidsuite.netlify.app/foundation/auth/login.html">Log In</a>
      </div>
      <p style="font-size:13px;color:#555;">
        God bless you,<br />
        <strong>The Rock Solid Foundation School Team</strong><br />
        BLW Canada
      </p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'batch_rollover_notice';

-- class_reassignment_notice — purple #4C2A92
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Class Assignment Updated</title>
  <style>
    body { margin:0; padding:0; background:#f7f7f7; font-family:'Manrope','DM Sans',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header { background:#4C2A92; padding:28px 40px 22px; text-align:center; }
    .header img { display:block; margin:0 auto 8px; }
    .header h1 { margin:0; color:#fff; font-size:24px; font-weight:800; letter-spacing:-.02em; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,.80); font-size:13px; }
    .body { padding:32px 40px; color:#1a1a2e; }
    .body p { margin:0 0 16px; line-height:1.65; font-size:15px; }
    .name { font-weight:800; color:#4C2A92; }
    .class-box { background:#f5f0ff; border-left:4px solid #4C2A92; border-radius:8px; padding:14px 18px; margin:20px 0; font-size:14px; color:#2d1b5e; line-height:1.6; }
    .reason-box { background:#fff8e1; border-left:4px solid #f59e0b; border-radius:8px; padding:12px 18px; margin:16px 0; font-size:13px; color:#78350f; line-height:1.6; }
    .cta { text-align:center; margin:28px 0; }
    .cta a { display:inline-block; background:#4C2A92; color:#fff; text-decoration:none; padding:12px 30px; border-radius:999px; font-weight:800; font-size:14px; }
    .footer { background:#f5f5f5; padding:20px 40px; text-align:center; color:#888; font-size:12px; line-height:1.7; }
    .footer a { color:#888; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Dear <span class="name">{{first_name}}</span>,</p>
      <p>Your class assignment has been updated by the Foundation School administration team.</p>
      <div class="class-box">
        <strong>Your new class:</strong><br />
        Teacher: {{teacher_name}}<br />
        Day &amp; Time: {{class_day}} at {{class_time}}
      </div>
      {{#reason}}
      <div class="reason-box">
        <strong>Reason for change:</strong><br />{{reason}}
      </div>
      {{/reason}}
      <p>If you have questions about this change, please contact your administrator.</p>
      <div class="cta">
        <a href="https://rocksolidsuite.netlify.app/foundation/auth/login.html">Go to Teacher Portal</a>
      </div>
      <p style="font-size:13px;color:#555;">
        God bless you,<br />
        <strong>The Rock Solid Foundation School Team</strong><br />
        BLW Canada
      </p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'class_reassignment_notice';

-- teacher_suspended — red #C8102E
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Account Suspended</title>
  <style>
    body { margin:0; padding:0; background:#f7f7f7; font-family:'Manrope','DM Sans',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header { background:#C8102E; padding:28px 40px 22px; text-align:center; }
    .header img { display:block; margin:0 auto 8px; }
    .header h1 { margin:0; color:#fff; font-size:24px; font-weight:800; letter-spacing:-.02em; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,.80); font-size:13px; }
    .body { padding:32px 40px; color:#1a1a2e; }
    .body p { margin:0 0 16px; line-height:1.65; font-size:15px; }
    .name { font-weight:800; color:#C8102E; }
    .reason-box { background:#fff5f5; border-left:4px solid #C8102E; border-radius:8px; padding:14px 18px; margin:20px 0; font-size:14px; color:#7f1d1d; line-height:1.6; }
    .cta { text-align:center; margin:28px 0; }
    .cta a { display:inline-block; background:#C8102E; color:#fff; text-decoration:none; padding:12px 30px; border-radius:999px; font-weight:800; font-size:14px; }
    .footer { background:#f5f5f5; padding:20px 40px; text-align:center; color:#888; font-size:12px; line-height:1.7; }
    .footer a { color:#888; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Dear <span class="name">{{first_name}}</span>,</p>
      <p>We are writing to let you know that your Foundation School teacher account has been temporarily suspended.</p>
      <div class="reason-box">
        <strong>Reason provided:</strong><br />{{reason}}
      </div>
      <p>While your account is suspended, you will not be able to access the teacher portal or manage your classes.</p>
      <p>If you believe this was done in error, or if you would like to discuss this further, please reach out to your administrator directly.</p>
      <div class="cta">
        <a href="mailto:foundation@lwcanada.org">Contact Administration</a>
      </div>
      <p style="font-size:13px;color:#555;">
        God bless you,<br />
        <strong>The Rock Solid Foundation School Team</strong><br />
        BLW Canada
      </p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'teacher_suspended';

-- teacher_reactivated — green #16a34a (was red)
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Account Reactivated</title>
  <style>
    body { margin:0; padding:0; background:#f7f7f7; font-family:'Manrope','DM Sans',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .header { background:#16a34a; padding:28px 40px 22px; text-align:center; }
    .header img { display:block; margin:0 auto 8px; }
    .header h1 { margin:0; color:#fff; font-size:24px; font-weight:800; letter-spacing:-.02em; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,.80); font-size:13px; }
    .body { padding:32px 40px; color:#1a1a2e; }
    .body p { margin:0 0 16px; line-height:1.65; font-size:15px; }
    .name { font-weight:800; color:#16a34a; }
    .welcome-box { background:#f0fdf4; border-left:4px solid #16a34a; border-radius:8px; padding:14px 18px; margin:20px 0; font-size:14px; color:#14532d; line-height:1.6; }
    .cta { text-align:center; margin:28px 0; }
    .cta a { display:inline-block; background:#C8102E; color:#fff; text-decoration:none; padding:12px 30px; border-radius:999px; font-weight:800; font-size:14px; }
    .footer { background:#f5f5f5; padding:20px 40px; text-align:center; color:#888; font-size:12px; line-height:1.7; }
    .footer a { color:#888; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Dear <span class="name">{{first_name}}</span>,</p>
      <p>Great news — your Foundation School teacher account has been <strong>reactivated</strong> and you now have full access again!</p>
      <div class="welcome-box">
        <strong>Welcome back!</strong><br />
        Your classes and assignments are as you left them. You can log in to the teacher portal to resume your responsibilities.
      </div>
      <p>We are glad to have you back serving in Foundation School. Your contribution to the growth and development of our students is truly valued.</p>
      <div class="cta">
        <a href="https://rocksolidsuite.netlify.app/foundation/auth/login.html">Go to Teacher Portal</a>
      </div>
      <p style="font-size:13px;color:#555;">
        God bless you,<br />
        <strong>The Rock Solid Foundation School Team</strong><br />
        BLW Canada
      </p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'teacher_reactivated';

-- registration_under_review_checkin — red #C8102E
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>An update on your Foundation School registration</title>
  <style>
    body { margin: 0; padding: 0; background: #f7f7f7; font-family: 'Manrope', 'DM Sans', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    .header { background: #C8102E; padding: 28px 40px 22px; text-align: center; }
    .header img { display: block; margin: 0 auto 8px; }
    .header h1 { margin: 0; color: #fff; font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
    .header p  { margin: 6px 0 0; color: rgba(255,255,255,.80); font-size: 13px; }
    .body { padding: 32px 40px; color: #1a1a2e; }
    .body p { margin: 0 0 16px; line-height: 1.65; font-size: 15px; }
    .name { font-weight: 800; color: #C8102E; }
    .timeline-box { background: #fff5f5; border-left: 4px solid #C8102E; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 14px; color: #7f1d1d; line-height: 1.6; }
    .timeline-box strong { display: block; margin-bottom: 4px; font-size: 15px; }
    .cta { text-align: center; margin: 28px 0; }
    .cta a { display: inline-block; background: #C8102E; color: #fff; text-decoration: none; padding: 13px 32px; border-radius: 999px; font-weight: 800; font-size: 15px; }
    .divider { border: none; border-top: 1px solid #f0f0f0; margin: 24px 0; }
    .footer { background: #f5f5f5; padding: 20px 40px; text-align: center; color: #888; font-size: 12px; line-height: 1.7; }
    .footer a { color: #888; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>Dear <span class="name">{{first_name}}</span>,</p>
      <p>
        Thank you so much for registering for Rock Solid Foundation School. We want you to know that we
        have received your application and our team is currently reviewing it.
      </p>
      <p>
        You have <strong>not</strong> been forgotten — our team personally reviews every registration
        to ensure you are placed in the right class for your schedule and fellowship community.
      </p>
      <div class="timeline-box">
        <strong>What to expect next</strong>
        Our team aims to complete all reviews within <strong>3&ndash;5 business days</strong>.
        Once your registration is approved, you will receive a separate email with your class assignment
        details.
      </div>
      <p>
        If you have any questions in the meantime, or if anything has changed in your availability,
        please do not hesitate to reply to this email — we are happy to help.
      </p>
      <p>
        We are genuinely excited to have you join Foundation School, and we look forward to
        welcoming you soon!
      </p>
      <div class="cta">
        <a href="mailto:foundation@lwcanada.org">Contact Us</a>
      </div>
      <hr class="divider" />
      <p style="font-size:13px;color:#555;">
        God bless you,<br />
        <strong>The Rock Solid Foundation School Team</strong><br />
        BLW Canada
      </p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'registration_under_review_checkin';

-- direct_message (notification_templates) — navy #1a3c5e (was purple)
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{subject}}</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Manrope', 'DM Sans', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(26,60,94,.10); }
    .header { background: #1a3c5e; padding: 28px 40px 22px; text-align: center; }
    .header img { display: block; margin: 0 auto 8px; }
    .header h1 { margin: 0; color: #fff; font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,.80); font-size: 13px; }
    .body { padding: 32px 40px; color: #1a1a2e; }
    .body p { margin: 0 0 16px; line-height: 1.7; font-size: 15px; white-space: pre-line; }
    .footer { background: #f5f5f5; padding: 20px 40px; text-align: center; color: #888; font-size: 12px; line-height: 1.7; }
    .footer a { color: #888; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;" />
      <h1>Rock Solid</h1>
      <p>Foundation School &middot; BLW Canada</p>
    </div>
    <div class="body">
      <p>{{message}}</p>
      <p style="margin-top:24px;color:#6f6881;font-size:13px;">Sent by {{sender_email}}</p>
    </div>
    <div class="footer">
      Rock Solid Foundation School &middot; BLW Canada<br />
      Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a>
    </div>
  </div>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'direct_message'
  AND EXISTS (SELECT 1 FROM public.notification_templates WHERE template_key = 'direct_message');

-- ================================================================
-- PART B: notification_templates — table/div-based full-HTML templates
-- ================================================================

-- engagement_never_started — purple #4C2A92
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Foundation School — Your Spot Is Reserved</title></head>
<body style="margin:0;padding:0;background:#f7f7fb;font-family:'Manrope',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fb;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e8e8f0;box-shadow:0 8px 32px rgba(26,20,43,.08);overflow:hidden;max-width:100%;">
      <tr><td style="background:#4C2A92;padding:32px 40px;text-align:center;">
        <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div>
        <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1a1a2e;">Hi {{first_name}} 👋</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">We noticed you've been registered for Foundation School but haven't joined your class yet — and we wanted to reach out personally to let you know: <strong>your spot is still reserved for you.</strong></p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
          <tr><td>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6366f1;font-weight:700;margin-bottom:8px;">Your Class Details</div>
            <div style="font-size:14px;color:#1a1a2e;">📅 <strong>{{class_time}}</strong></div>
            <div style="font-size:14px;color:#1a1a2e;margin-top:4px;">👩‍🏫 Teacher: <strong>{{teacher_name}}</strong></div>
            <div style="font-size:14px;color:#1a1a2e;margin-top:4px;">🏛️ Fellowship: <strong>{{fellowship_code}}</strong></div>
          </td></tr>
        </table>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">Your Moodle learning account has already been set up and is ready for you at <a href="https://rocksolid.lwcanada.org/" style="color:#4C2A92;font-weight:600;">rocksolid.lwcanada.org</a>. Log in using the email address this message was sent to.</p>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">If you need help getting started or have any questions, simply reply to this email — we're here for you!</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td style="background:#C8102E;border-radius:10px;padding:14px 28px;">
            <a href="https://rocksolid.lwcanada.org/" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Go to My Class →</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:#9ca3af;">We're excited to have you in Foundation School. See you soon!<br>— The Rock Solid Foundation School Team</p>
      </td></tr>
      <tr><td style="background:#f5f5f5;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>$q$,
    updated_at = now()
WHERE template_key = 'engagement_never_started';

-- engagement_dropped_off — purple #4C2A92
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Foundation School — We Miss You</title></head>
<body style="margin:0;padding:0;background:#f7f7fb;font-family:'Manrope',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fb;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e8e8f0;box-shadow:0 8px 32px rgba(26,20,43,.08);overflow:hidden;max-width:100%;">
      <tr><td style="background:#4C2A92;padding:32px 40px;text-align:center;">
        <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div>
        <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1a1a2e;">Hi {{first_name}} 💙</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">The team has been thinking about you. We noticed it's been a little while since we last saw you in class, and we just wanted to check in — <strong>how are you doing?</strong></p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
          <tr><td>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#c2410c;font-weight:700;margin-bottom:8px;">Your Class</div>
            <div style="font-size:14px;color:#1a1a2e;">📅 <strong>{{class_time}}</strong> with <strong>{{teacher_name}}</strong></div>
            <div style="font-size:14px;color:#6b7280;margin-top:4px;">Your last attended session: <strong>{{last_attended_date}}</strong></div>
            <div style="font-size:14px;color:#6b7280;margin-top:2px;">Sessions you may have missed: <strong>{{sessions_missed}}</strong></div>
          </td></tr>
        </table>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">There is still so much wonderful content ahead, and your classmates and teacher would love to see you back. If something has come up or you need to switch to a different class time, we're happy to help!</p>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">Simply reply to this email and let us know, or jump back in at <a href="https://rocksolid.lwcanada.org/" style="color:#4C2A92;font-weight:600;">rocksolid.lwcanada.org</a>.</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td style="background:#C8102E;border-radius:10px;padding:14px 28px;">
            <a href="https://rocksolid.lwcanada.org/" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Return to My Class →</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:#9ca3af;">We care about your growth and want to see you thrive in this course.<br>— The Rock Solid Foundation School Team</p>
      </td></tr>
      <tr><td style="background:#f5f5f5;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>$q$,
    updated_at = now()
WHERE template_key = 'engagement_dropped_off';

-- engagement_final_notice — red #C8102E
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Foundation School — Important Update</title></head>
<body style="margin:0;padding:0;background:#f7f7fb;font-family:'Manrope',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fb;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e8e8f0;box-shadow:0 8px 32px rgba(26,20,43,.08);overflow:hidden;max-width:100%;">
      <tr><td style="background:#C8102E;padding:32px 40px;text-align:center;">
        <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div>
        <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1a1a2e;">Hi {{first_name}},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">We have reached out to you a couple of times over the past few weeks and haven't heard back. We want to make sure you're okay first and foremost — if there's something we can do to help, please don't hesitate to reach out.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f5;border:1px solid #fca5a5;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
          <tr><td>
            <div style="font-size:14px;color:#b42318;font-weight:700;">Important notice about your enrollment</div>
            <div style="font-size:14px;color:#374151;margin-top:8px;line-height:1.6;">If we do not hear from you within <strong>7 days</strong>, your spot in this Foundation School batch may be made available to another student on the waitlist. We want every seat to go to someone who is ready to engage.</div>
          </td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">To keep your spot, simply reply to this email with a brief note letting us know you'd like to continue. We will take it from there.</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td style="background:#C8102E;border-radius:10px;padding:14px 28px;margin-right:8px;">
              <a href="mailto:admin@lwcanada.org?subject=I%20want%20to%20keep%20my%20spot%20in%20Foundation%20School" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Reply to Keep My Spot</a>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-size:13px;color:#9ca3af;">We genuinely hope to hear from you.<br>— The Rock Solid Foundation School Team</p>
      </td></tr>
      <tr><td style="background:#f5f5f5;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>$q$,
    updated_at = now()
WHERE template_key = 'engagement_final_notice';

-- class_time_changed — purple #4C2A92
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Class Time Update</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Manrope,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(76,42,146,.10);">
        <tr>
          <td style="background:#4C2A92;padding:32px 40px;text-align:center;">
            <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div>
            <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="font-size:17px;font-weight:700;color:#171327;margin:0 0 14px;">Hi {{first_name}},</p>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 22px;">
              We want to let you know that your Foundation School class schedule has been updated. Your teacher, <strong>{{teacher_name}}</strong>, is the same — only the time has changed.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;margin:0 0 28px;border:1px solid #e5e0f5;">
              <tr style="background:#fff1f0;">
                <td style="padding:16px 24px;border-bottom:1px solid #e5e0f5;">
                  <div style="font-size:12px;font-weight:700;color:#c0392b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Previous Time</div>
                  <div style="font-size:16px;color:#888;text-decoration:line-through;">{{old_day}} at {{old_time}}</div>
                </td>
              </tr>
              <tr style="background:#f0fff4;">
                <td style="padding:16px 24px;">
                  <div style="font-size:12px;font-weight:700;color:#27ae60;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">New Time</div>
                  <div style="font-size:18px;font-weight:700;color:#27ae60;">{{new_day}} at {{new_time}}</div>
                </td>
              </tr>
            </table>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px;">
              If this new time does not work for you, please <strong>reply to this email</strong> as soon as possible so we can explore other options.
            </p>
            <p style="font-size:14px;color:#888;line-height:1.6;margin:0;">
              We apologize for any inconvenience and appreciate your flexibility. See you in class!
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;padding:16px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'class_time_changed';

-- class_slot_cancelled — dark red #7f1d1d (was red #C8102E)
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Class Cancellation Notice</title>
</head>
<body style="margin:0;padding:0;background:#fff5f5;font-family:Manrope,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(127,29,29,.08);">
        <tr>
          <td style="background:#7f1d1d;padding:32px 40px;text-align:center;">
            <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div>
            <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="font-size:17px;font-weight:700;color:#171327;margin:0 0 14px;">Dear {{first_name}},</p>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 18px;">
              We are writing to let you know that your Foundation School class — <strong>{{class_day}} at {{class_time}}</strong> with <strong>{{teacher_name}}</strong> — has unfortunately been <strong>cancelled</strong>.
            </p>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 18px;">
              We sincerely apologize for this disruption. Our team is actively working on alternatives, and someone will be in touch with you shortly to discuss your options and next steps.
            </p>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 24px;">
              If you have any questions or concerns in the meantime, please <strong>reply to this email</strong> and we will get back to you as soon as possible.
            </p>
            <p style="font-size:14px;color:#888;line-height:1.6;margin:0;">
              Thank you for your patience and understanding. We value your commitment to Foundation School.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;padding:16px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'class_slot_cancelled';

-- waitlist_promoted — purple #4C2A92
UPDATE public.notification_templates
SET body_html = $q$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You Have Been Assigned!</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Manrope,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(76,42,146,.10);">
        <tr>
          <td style="background:#4C2A92;padding:32px 40px;text-align:center;">
            <img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div>
            <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="font-size:18px;font-weight:700;color:#171327;margin:0 0 16px;">Hi {{first_name}},</p>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px;">
              Your patience has paid off! We are thrilled to let you know that a spot has opened up in a Foundation School class, and you have been <strong>officially assigned</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border-radius:12px;margin:0 0 28px;">
              <tr>
                <td style="padding:24px 28px;">
                  <div style="font-size:13px;color:#6b5c91;text-transform:uppercase;font-weight:700;letter-spacing:.08em;margin-bottom:12px;">Your Class Details</div>
                  <div style="font-size:16px;font-weight:700;color:#4C2A92;margin-bottom:6px;">📅 {{class_day}} at {{class_time}}</div>
                  <div style="font-size:15px;color:#444;margin-bottom:4px;">👩‍🏫 Teacher: <strong>{{teacher_name}}</strong></div>
                  <div style="font-size:15px;color:#444;">📍 Fellowship: <strong>{{fellowship_code}}</strong></div>
                </td>
              </tr>
            </table>
            <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px;">
              Your next step is to log in to Moodle and complete your course materials. Your class is ready and waiting for you.
            </p>
            <div style="text-align:center;margin:0 0 28px;">
              <a href="{{moodle_url}}" style="display:inline-block;background:#4C2A92;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
                Log in to Moodle →
              </a>
            </div>
            <p style="font-size:14px;color:#888;line-height:1.6;margin:0;">
              If you have any questions, simply reply to this email. We look forward to seeing you in class!
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;padding:16px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>$q$,
    updated_at = now()
WHERE template_key = 'waitlist_promoted';

-- classes_now_available — purple #4C2A92 (already had logo; updated to 72px + new title/footer)
UPDATE public.notification_templates
SET body_html = $q$<div style="font-family:Arial,sans-serif;background:#f5f5f7;padding:24px"><div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5ea"><div style="background:#4C2A92;padding:24px 32px;text-align:center;"><img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" /><div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div><div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div></div><div style="padding:24px;color:#1a1a1f"><p style="margin:0 0 14px">Hi {{first_name}},</p><p style="margin:0 0 14px">We have great news! Foundation School classes are now available for your fellowship and we'd love for you to join us.</p><p style="margin:0 0 18px">To secure your spot, please choose your preferred class time using the button below. Your selection link is personal to you and expires in 7 days.</p><p style="margin:0 0 22px"><a href="{{selection_url}}" style="display:inline-block;background:#4C2A92;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">Choose My Class Time</a></p><p style="margin:0 0 14px">Once you select a class, you will receive a confirmation email with your Moodle login details. No re-registration needed.</p></div><div style="background:#f5f5f5;padding:14px 24px;text-align:center;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></div></div></div>$q$,
    updated_at = now()
WHERE template_key = 'classes_now_available';

-- class_assigned_confirmation — purple #4C2A92 (already had logo; updated to 72px + new title/footer)
UPDATE public.notification_templates
SET body_html = $q$<div style="font-family:Arial,sans-serif;background:#f5f5f7;padding:24px"><div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5ea"><div style="background:#4C2A92;padding:24px 32px;text-align:center;"><img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" /><div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Rock Solid</div><div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Foundation School &middot; BLW Canada</div></div><div style="padding:24px;color:#1a1a1f"><p style="margin:0 0 14px">Hi {{first_name}}, your class is confirmed!</p><div style="border:1px solid #4dcc8f;background:#f1fff7;color:#155b3b;border-radius:10px;padding:14px 16px;margin:0 0 16px"><p style="margin:0 0 8px;font-weight:700">✓ Class Details</p><p style="margin:0 0 4px">Teacher: {{teacher_name}}</p><p style="margin:0">Day &amp; Time: {{class_day}} at {{class_time}}</p></div><p style="margin:0 0 18px">Your Moodle learning account will be set up shortly and you will receive login details in a separate email.</p><p style="margin:0"><a href="https://rocksolid.lwcanada.org/" style="display:inline-block;background:#4C2A92;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">Visit Moodle</a></p></div><div style="background:#f5f5f5;padding:14px 24px;text-align:center;font-size:12px;color:#888;">Rock Solid Foundation School &middot; BLW Canada<br />Questions? <a href="mailto:info@lwcanada.org" style="color:#888;">info@lwcanada.org</a></div></div></div>$q$,
    updated_at = now()
WHERE template_key = 'class_assigned_confirmation';

-- ================================================================
-- PART C: notification_templates — placeholder/minimal templates
-- Wrap existing body_html in full HTML structure.
-- Guard: skip if already wrapped (idempotent).
-- ================================================================

-- Red #C8102E group
UPDATE public.notification_templates
SET body_html =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>'
  'body{margin:0;padding:0;background:#f7f7f7;font-family:''Manrope'',Arial,sans-serif;}'
  '.wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);}'
  '.header{background:#C8102E;padding:28px 40px 22px;text-align:center;}'
  '.header img{display:block;margin:0 auto 8px;}'
  '.header h1{margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-.02em;}'
  '.header p{margin:6px 0 0;color:rgba(255,255,255,.80);font-size:13px;}'
  '.body{padding:32px 40px;color:#1a1a2e;}'
  '.body p{margin:0 0 16px;line-height:1.65;font-size:15px;}'
  '.footer{background:#f5f5f5;padding:20px 40px;text-align:center;color:#888;font-size:12px;line-height:1.7;}'
  '.footer a{color:#888;text-decoration:none;}'
  '</style></head><body><div class="wrapper">'
  '<div class="header">'
  '<img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;"/>'
  '<h1>Rock Solid</h1><p>Foundation School &middot; BLW Canada</p></div>'
  '<div class="body">' || body_html || '</div>'
  '<div class="footer">Rock Solid Foundation School &middot; BLW Canada<br/>'
  'Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a></div>'
  '</div></body></html>',
    updated_at = now()
WHERE template_key IN (
    'foundation_welcome', 'no_class_available', 'no_suitable_times',
    'duplicate_registration', 'waitlist_confirmation', 'registration_under_review',
    'moodle_credentials'
  )
  AND body_html NOT LIKE '<!DOCTYPE%';

-- Navy #1a3c5e group
UPDATE public.notification_templates
SET body_html =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>'
  'body{margin:0;padding:0;background:#f0f4f8;font-family:''Manrope'',Arial,sans-serif;}'
  '.wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);}'
  '.header{background:#1a3c5e;padding:28px 40px 22px;text-align:center;}'
  '.header img{display:block;margin:0 auto 8px;}'
  '.header h1{margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-.02em;}'
  '.header p{margin:6px 0 0;color:rgba(255,255,255,.80);font-size:13px;}'
  '.body{padding:32px 40px;color:#1a1a2e;}'
  '.body p{margin:0 0 16px;line-height:1.65;font-size:15px;}'
  '.footer{background:#f5f5f5;padding:20px 40px;text-align:center;color:#888;font-size:12px;line-height:1.7;}'
  '.footer a{color:#888;text-decoration:none;}'
  '</style></head><body><div class="wrapper">'
  '<div class="header">'
  '<img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;"/>'
  '<h1>Rock Solid</h1><p>Foundation School &middot; BLW Canada</p></div>'
  '<div class="body">' || body_html || '</div>'
  '<div class="footer">Rock Solid Foundation School &middot; BLW Canada<br/>'
  'Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a></div>'
  '</div></body></html>',
    updated_at = now()
WHERE template_key = 'class_assigned'
  AND body_html NOT LIKE '<!DOCTYPE%';

-- Purple #4C2A92 group (reminder templates)
UPDATE public.notification_templates
SET body_html =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>'
  'body{margin:0;padding:0;background:#f5f3ff;font-family:''Manrope'',Arial,sans-serif;}'
  '.wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(76,42,146,.10);}'
  '.header{background:#4C2A92;padding:28px 40px 22px;text-align:center;}'
  '.header img{display:block;margin:0 auto 8px;}'
  '.header h1{margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-.02em;}'
  '.header p{margin:6px 0 0;color:rgba(255,255,255,.80);font-size:13px;}'
  '.body{padding:32px 40px;color:#1a1a2e;}'
  '.body p{margin:0 0 16px;line-height:1.65;font-size:15px;}'
  '.footer{background:#f5f5f5;padding:20px 40px;text-align:center;color:#888;font-size:12px;line-height:1.7;}'
  '.footer a{color:#888;text-decoration:none;}'
  '</style></head><body><div class="wrapper">'
  '<div class="header">'
  '<img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;"/>'
  '<h1>Rock Solid</h1><p>Foundation School &middot; BLW Canada</p></div>'
  '<div class="body">' || body_html || '</div>'
  '<div class="footer">Rock Solid Foundation School &middot; BLW Canada<br/>'
  'Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a></div>'
  '</div></body></html>',
    updated_at = now()
WHERE template_key IN ('class_reminder_7_day', 'class_reminder_1_day', 'class_reminder_2_hour')
  AND body_html NOT LIKE '<!DOCTYPE%';

-- ================================================================
-- PART D: email_templates — wrap all minimal-HTML entries
-- ================================================================

-- Purple #4C2A92: attendance_reminder
UPDATE public.email_templates
SET body_html =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>'
  'body{margin:0;padding:0;background:#f5f3ff;font-family:''Manrope'',Arial,sans-serif;}'
  '.wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(76,42,146,.10);}'
  '.header{background:#4C2A92;padding:28px 40px 22px;text-align:center;}'
  '.header img{display:block;margin:0 auto 8px;}'
  '.header h1{margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-.02em;}'
  '.header p{margin:6px 0 0;color:rgba(255,255,255,.80);font-size:13px;}'
  '.body{padding:32px 40px;color:#1a1a2e;}'
  '.body p{margin:0 0 16px;line-height:1.65;font-size:15px;}'
  '.footer{background:#f5f5f5;padding:20px 40px;text-align:center;color:#888;font-size:12px;line-height:1.7;}'
  '.footer a{color:#888;text-decoration:none;}'
  '</style></head><body><div class="wrapper">'
  '<div class="header">'
  '<img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;"/>'
  '<h1>Rock Solid</h1><p>Foundation School &middot; BLW Canada</p></div>'
  '<div class="body">' || body_html || '</div>'
  '<div class="footer">Rock Solid Foundation School &middot; BLW Canada<br/>'
  'Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a></div>'
  '</div></body></html>',
    updated_at = now()
WHERE template_key = 'attendance_reminder'
  AND body_html NOT LIKE '<!DOCTYPE%';

-- Red #C8102E: attendance_escalation, moodle_credentials
UPDATE public.email_templates
SET body_html =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>'
  'body{margin:0;padding:0;background:#f7f7f7;font-family:''Manrope'',Arial,sans-serif;}'
  '.wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);}'
  '.header{background:#C8102E;padding:28px 40px 22px;text-align:center;}'
  '.header img{display:block;margin:0 auto 8px;}'
  '.header h1{margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-.02em;}'
  '.header p{margin:6px 0 0;color:rgba(255,255,255,.80);font-size:13px;}'
  '.body{padding:32px 40px;color:#1a1a2e;}'
  '.body p{margin:0 0 16px;line-height:1.65;font-size:15px;}'
  '.footer{background:#f5f5f5;padding:20px 40px;text-align:center;color:#888;font-size:12px;line-height:1.7;}'
  '.footer a{color:#888;text-decoration:none;}'
  '</style></head><body><div class="wrapper">'
  '<div class="header">'
  '<img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;"/>'
  '<h1>Rock Solid</h1><p>Foundation School &middot; BLW Canada</p></div>'
  '<div class="body">' || body_html || '</div>'
  '<div class="footer">Rock Solid Foundation School &middot; BLW Canada<br/>'
  'Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a></div>'
  '</div></body></html>',
    updated_at = now()
WHERE template_key IN ('attendance_escalation', 'moodle_credentials')
  AND body_html NOT LIKE '<!DOCTYPE%';

-- Navy #1a3c5e: direct_message
UPDATE public.email_templates
SET body_html =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>'
  'body{margin:0;padding:0;background:#f0f4f8;font-family:''Manrope'',Arial,sans-serif;}'
  '.wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(26,60,94,.10);}'
  '.header{background:#1a3c5e;padding:28px 40px 22px;text-align:center;}'
  '.header img{display:block;margin:0 auto 8px;}'
  '.header h1{margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-.02em;}'
  '.header p{margin:6px 0 0;color:rgba(255,255,255,.80);font-size:13px;}'
  '.body{padding:32px 40px;color:#1a1a2e;}'
  '.body p{margin:0 0 16px;line-height:1.65;font-size:15px;}'
  '.footer{background:#f5f5f5;padding:20px 40px;text-align:center;color:#888;font-size:12px;line-height:1.7;}'
  '.footer a{color:#888;text-decoration:none;}'
  '</style></head><body><div class="wrapper">'
  '<div class="header">'
  '<img src="https://rocksolidsuite.netlify.app/foundation/registration/canada_sr.png" alt="BLW Canada" style="height:72px;margin-bottom:8px;"/>'
  '<h1>Rock Solid</h1><p>Foundation School &middot; BLW Canada</p></div>'
  '<div class="body">' || body_html || '</div>'
  '<div class="footer">Rock Solid Foundation School &middot; BLW Canada<br/>'
  'Questions? <a href="mailto:info@lwcanada.org">info@lwcanada.org</a></div>'
  '</div></body></html>',
    updated_at = now()
WHERE template_key = 'direct_message'
  AND body_html NOT LIKE '<!DOCTYPE%';

-- ================================================================
-- PART E: config
-- ================================================================

UPDATE public.config
SET value      = 'info@lwcanada.org',
    updated_at = now()
WHERE key = 'REPLY_TO';
