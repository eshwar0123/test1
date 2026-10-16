-- Part 1: patient image links (valid 24h from report submission)
CREATE SCHEMA IF NOT EXISTS share_schema;

CREATE TABLE IF NOT EXISTS share_schema.patient_view_links (
  link_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          TEXT NOT NULL,
  org_id           TEXT,
  token            TEXT NOT NULL UNIQUE,          -- random 32 bytes, URL-safe
  expires_at       TIMESTAMPTZ NOT NULL,          -- reports.completed_at (IST) + 24h
  revoked_at       TIMESTAMPTZ,
  access_count     INT NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patient_view_links_case_id_idx
  ON share_schema.patient_view_links (case_id);

-- Part 2: technician manages radiologists and assigns cases
ALTER TABLE radiology_schema.radiologists
  ADD COLUMN IF NOT EXISTS org_id     TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE organization_schema.org_profile
  ADD COLUMN IF NOT EXISTS assign_by_technician BOOLEAN NOT NULL DEFAULT FALSE;

-- Enable for BRAHM SHAKTI only (run manually once):
-- UPDATE organization_schema.org_profile
--    SET assign_by_technician = TRUE
--  WHERE lower(btrim(org_name)) = lower('BRAHM SHAKTI SANJIVANI SUPER SPECIALITY HOSPITAL');
