-- Allow REGIONAL and future special fellowships to have no group/subgroup
ALTER TABLE public.fellowship_map 
ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE public.fellowship_map 
ALTER COLUMN subgroup_id DROP NOT NULL;

-- Insert REGIONAL as a Canada-wide option
INSERT INTO public.fellowship_map 
  (fellowship_code, campus_name, group_id, subgroup_id, timezone, active)
VALUES 
  ('REGIONAL', 'Canada-wide (Online)', NULL, NULL, 'America/Toronto', true)
ON CONFLICT (fellowship_code) DO UPDATE
SET campus_name = 'Canada-wide (Online)', active = true;
