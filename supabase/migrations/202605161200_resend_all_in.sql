-- Ensure target notification templates are present and normalized; warn for placeholder content.

UPDATE notification_templates
SET body_html = NULLIF(BTRIM(body_html), '')
WHERE template_key IN (
  'foundation_welcome',
  'class_assigned',
  'waitlist_confirmation',
  'no_class_available',
  'no_suitable_times',
  'duplicate_registration',
  'registration_under_review'
);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT template_key
    FROM notification_templates
    WHERE template_key IN (
      'foundation_welcome',
      'class_assigned',
      'waitlist_confirmation',
      'no_class_available',
      'no_suitable_times',
      'duplicate_registration',
      'registration_under_review'
    )
    AND (
      body_html IS NULL
      OR body_html !~* '<[^>]+>'
      OR body_html ~* '^\s*<p>\s*[^<]{0,220}\s*</p>\s*$'
    )
  LOOP
    RAISE WARNING 'notification_templates.% has placeholder or insufficient body_html; update in dashboard', r.template_key;
  END LOOP;
END
$$;
