-- Lead Intake Workspace: manual ARV / repair estimates on leads.
-- Lets agents record deal math (ARV, repair estimate) directly on a lead
-- during intake, before a property record exists.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS arv_estimate numeric(12,2);
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN IF NOT EXISTS repair_estimate numeric(12,2);
