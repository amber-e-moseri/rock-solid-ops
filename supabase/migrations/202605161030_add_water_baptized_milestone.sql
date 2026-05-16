INSERT INTO milestone_definitions (code, label, description, is_required)
VALUES ('WATER_BAPTIZED', 'Water Baptized', 'Student has been water baptized', false)
ON CONFLICT (code) DO NOTHING;
