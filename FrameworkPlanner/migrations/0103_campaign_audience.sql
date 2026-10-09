-- 0103: Add missing audience column to campaigns table.
-- Migration 0088 added broadcast fields but missed the audience column
-- that the schema expects. This was causing "column audience does not exist"
-- errors when creating campaigns.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience VARCHAR(10) NOT NULL DEFAULT 'leads';
