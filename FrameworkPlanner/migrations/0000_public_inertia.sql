CREATE TABLE "ai_action_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_action_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_by" integer NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"transcript" text NOT NULL,
	"parsed_json" jsonb NOT NULL,
	"selection_json" jsonb NOT NULL,
	"applied_json" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_action_undo" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_action_undo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ai_action_log_id" integer NOT NULL,
	"undo_json" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"undone_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "app_audit_findings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_audit_findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"severity" varchar(20) NOT NULL,
	"area" varchar(80) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"recommendation" text,
	"technical_notes" text,
	"affected_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fix_plan" text,
	"owner_user_id" integer,
	"prd_section" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "app_audit_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_audit_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_by" integer NOT NULL,
	"scope_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "approval_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "approval_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"action" varchar(32) NOT NULL,
	"by_user_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"actor_user_id" integer,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer,
	"action" varchar(80) NOT NULL,
	"before_json" text,
	"after_json" text,
	"diff_json" text,
	"ip" varchar(64),
	"user_agent" text,
	"request_id" varchar(64),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auth_audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"action" varchar(100) NOT NULL,
	"outcome" varchar(50) NOT NULL,
	"user_id" integer,
	"email" varchar(255),
	"ip" varchar(100),
	"user_agent" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_magic_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auth_magic_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"request_ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_actions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"automation_id" integer NOT NULL,
	"action_type" varchar(80) NOT NULL,
	"config_json" text DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_conditions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_conditions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"automation_id" integer NOT NULL,
	"config_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"automation_id" integer NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"event_json" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"error" text,
	"delivery_id" varchar(36),
	"created_at" timestamp DEFAULT now(),
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "automation_triggers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_triggers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"automation_id" integer NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"config_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "backup_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "backup_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"is_used" boolean DEFAULT false,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "buyer_communications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "buyer_communications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"buyer_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"subject" varchar(255),
	"content" text,
	"direction" varchar(20) DEFAULT 'outbound',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "buyer_profiles" (
	"id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"target_states" text[],
	"target_zips" text[],
	"strategies" text[],
	"min_spread" numeric(12, 2),
	"min_yield" numeric(8, 4),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "buyers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"company" varchar(255),
	"email" varchar(255),
	"phone" varchar(20),
	"preferred_property_types" text[],
	"preferred_areas" text[],
	"min_budget" numeric(12, 2),
	"max_budget" numeric(12, 2),
	"zip_codes" text[],
	"min_price" numeric(12, 2),
	"max_price" numeric(12, 2),
	"min_beds" integer,
	"max_beds" integer,
	"property_types" text[],
	"deals_per_month" integer,
	"proof_of_funds" boolean DEFAULT false,
	"proof_of_funds_verified_at" timestamp,
	"proof_of_funds_notes" text,
	"is_vip" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'active',
	"total_deals" integer DEFAULT 0,
	"total_revenue" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"tags" text[],
	"last_contact_date" timestamp,
	"dedupe_key" varchar(400),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "call_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"direction" varchar(20) NOT NULL,
	"number" varchar(20) NOT NULL,
	"contact_id" integer,
	"lead_id" integer,
	"status" varchar(50) NOT NULL,
	"disposition" varchar(50),
	"note" text,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"duration_ms" integer,
	"error_code" varchar(50),
	"error_message" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "call_media" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "call_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"call_log_id" integer,
	"kind" varchar(20) NOT NULL,
	"e164" varchar(20),
	"storage_key" text,
	"provider_url" text,
	"provider_sid" varchar(64),
	"mime_type" varchar(100),
	"duration_seconds" integer,
	"transcript" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "call_notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "call_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"call_log_id" integer NOT NULL,
	"disposition" varchar(50),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_deliveries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"enrollment_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"step_id" integer,
	"channel" varchar(10) NOT NULL,
	"status" varchar(20) NOT NULL,
	"provider_id" varchar(120),
	"error" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_enrollments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_enrollments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"next_step_order" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_steps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"channel" varchar(10) NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"send_window_start" varchar(5),
	"send_window_end" varchar(5),
	"template_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "category_rate_overrides" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_rate_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"hourly_rate" numeric(10, 2),
	"cost_rate" numeric(10, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commission_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "commission_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_type" varchar(20) NOT NULL,
	"source_id" integer NOT NULL,
	"milestone" varchar(40) NOT NULL,
	"event_date" date NOT NULL,
	"gross_amount" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commission_ledger_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "commission_ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"rule_snapshot" jsonb,
	"approved_by_user_id" integer,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"disputed_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comp_snapshot_rows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comp_snapshot_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"opportunity_id" integer NOT NULL,
	"comp_property_id" integer NOT NULL,
	"distance_miles" numeric(8, 3),
	"sold_price" numeric(12, 2),
	"sold_date" date,
	"is_rental_comp" boolean DEFAULT false NOT NULL,
	"rent_per_month" numeric(12, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comp_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comp_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"provider_name" varchar(100) NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"comps_json" text DEFAULT '[]' NOT NULL,
	"raw_response_json" text,
	"arv_suggestion" numeric(12, 2),
	"offer_range_min" numeric(12, 2),
	"offer_range_max" numeric(12, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "companies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"company_type" varchar(50),
	"website" varchar(500),
	"phone" varchar(32),
	"email" varchar(255),
	"address" text,
	"notes" text,
	"tags" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "company_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"role" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_people" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "company_people_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"title" varchar(120),
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"type" varchar(50),
	"company" varchar(255),
	"notes" text,
	"dedupe_key" varchar(400),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"template_id" integer,
	"property_id" integer,
	"title" varchar(255) NOT NULL,
	"document_type" varchar(50) DEFAULT 'contract',
	"status" varchar(50) DEFAULT 'draft',
	"content" text NOT NULL,
	"merge_data" text,
	"pdf_url" varchar(500),
	"version" integer DEFAULT 1,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_envelopes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_envelopes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"document_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"signer_name" varchar(255),
	"signer_email" varchar(255),
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp,
	"sent_at" timestamp,
	"viewed_at" timestamp,
	"signed_at" timestamp,
	"declined_at" timestamp,
	"signature_type" varchar(20),
	"signature_text" varchar(255),
	"signature_image_base64" text,
	"audit_json" text DEFAULT '[]' NOT NULL,
	"signed_pdf_base64" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"content" text NOT NULL,
	"merge_fields" text[],
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contracts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"buyer_id" integer,
	"seller_id" integer,
	"amount" numeric(12, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"sign_date" timestamp,
	"close_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_export_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crm_export_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" varchar(32) NOT NULL,
	"created_by" integer NOT NULL,
	"status" varchar(32) DEFAULT 'queued',
	"format" varchar(16) NOT NULL,
	"filename" varchar(255),
	"mime_type" varchar(100),
	"content_base64" text,
	"token_hash" varchar(64),
	"expires_at" timestamp,
	"filters" text NOT NULL,
	"columns" text NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_import_job_errors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crm_import_job_errors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"errors" text NOT NULL,
	"raw_row" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_import_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crm_import_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" varchar(32) NOT NULL,
	"created_by" integer NOT NULL,
	"status" varchar(32) DEFAULT 'queued',
	"original_filename" varchar(255),
	"file_mime_type" varchar(100),
	"file_base64" text NOT NULL,
	"mapping" text NOT NULL,
	"options" text NOT NULL,
	"total_rows" integer,
	"processed_rows" integer DEFAULT 0,
	"created_count" integer DEFAULT 0,
	"updated_count" integer DEFAULT 0,
	"skipped_count" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deal_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"contract_id" integer,
	"assignment_fee" numeric(12, 2),
	"purchase_price" numeric(12, 2),
	"assigned_price" numeric(12, 2),
	"status" varchar(50) DEFAULT 'pending',
	"closing_date" timestamp,
	"title_company" varchar(255),
	"earnest_money_received" boolean DEFAULT false,
	"title_cleared" boolean DEFAULT false,
	"closing_scheduled" boolean DEFAULT false,
	"documents_complete" boolean DEFAULT false,
	"payout_received" boolean DEFAULT false,
	"payout_amount" numeric(12, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_buyer_matches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deal_buyer_matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"score" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_participants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deal_participants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_type" varchar(20) NOT NULL,
	"source_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(32) NOT NULL,
	"split_pct" numeric(5, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"relation" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"document_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"changes" text,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"kind" varchar(50),
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer,
	"storage_key" text NOT NULL,
	"sha256" varchar(64),
	"tags" text[],
	"is_private" boolean DEFAULT false,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "field_media_assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "field_media_assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"lead_id" integer,
	"kind" varchar(20) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"content_base64" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "global_activity_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "global_activity_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"action" varchar(255) NOT NULL,
	"description" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_bulk_action_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_bulk_action_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_by" integer NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"action" varchar(50) NOT NULL,
	"selection_scope" varchar(32) NOT NULL,
	"lead_ids" jsonb,
	"filter_json" jsonb,
	"total_targets" integer DEFAULT 0,
	"processed" integer DEFAULT 0,
	"succeeded" integer DEFAULT 0,
	"failed" integer DEFAULT 0,
	"result_json" jsonb,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lead_id" integer NOT NULL,
	"created_by" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_score_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_score_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" varchar(20) NOT NULL,
	"entity_id" integer NOT NULL,
	"job_id" integer,
	"score_total" integer NOT NULL,
	"confidence" varchar(20),
	"urgency_tier" varchar(20),
	"reason_summary" text,
	"factors_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_source_options" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_source_options_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"value" varchar(100) NOT NULL,
	"label" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(255) NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"zip_code" varchar(10) NOT NULL,
	"owner_name" varchar(255) NOT NULL,
	"owner_phone" varchar(20),
	"owner_email" varchar(255),
	"estimated_value" numeric(12, 2),
	"relas_score" integer,
	"motivation" varchar(50),
	"status" varchar(50) DEFAULT 'new',
	"notes" text,
	"source" varchar(100),
	"assigned_to" integer,
	"archived_at" timestamp,
	"status_changed_at" timestamp,
	"lead_type" varchar(50),
	"county" varchar(100),
	"owner_occupied" boolean,
	"do_not_call" boolean DEFAULT false NOT NULL,
	"do_not_text" boolean DEFAULT false NOT NULL,
	"do_not_email" boolean DEFAULT false NOT NULL,
	"last_touch_at" timestamp,
	"next_touch_at" timestamp,
	"next_follow_up_at" timestamp,
	"tags" text[],
	"dedupe_key" varchar(400),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lois" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lois_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"buyer_name" varchar(255) NOT NULL,
	"seller_name" varchar(255) NOT NULL,
	"offer_amount" numeric(12, 2) NOT NULL,
	"earnest_money" numeric(12, 2),
	"closing_date" timestamp,
	"contingencies" text[],
	"special_terms" text,
	"status" varchar(50) DEFAULT 'draft',
	"sent_date" timestamp,
	"response_date" timestamp,
	"content" text,
	"pdf_url" varchar(500),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"email_enabled" boolean DEFAULT true,
	"push_enabled" boolean DEFAULT true,
	"in_app_enabled" boolean DEFAULT true,
	"new_leads" boolean DEFAULT true,
	"deal_updates" boolean DEFAULT true,
	"contract_alerts" boolean DEFAULT true,
	"weekly_summary" boolean DEFAULT true,
	"frequency" varchar(50) DEFAULT 'instant',
	"dnd_enabled" boolean DEFAULT false,
	"dnd_start_time" varchar(10),
	"dnd_end_time" varchar(10),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "number_reputation" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "number_reputation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"e164" varchar(20) NOT NULL,
	"label" varchar(20) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"buyer_name" varchar(255),
	"seller_name" varchar(255),
	"offer_amount" numeric(12, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"sent_date" timestamp,
	"response_date" timestamp,
	"expiration_date" timestamp,
	"notes" text,
	"documents" text[],
	"response_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_reset_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"request_ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_periods" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pay_periods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_configs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pipeline_configs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"columns" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playground_property_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playground_property_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(500) NOT NULL,
	"address_key" text NOT NULL,
	"property_type" varchar(50),
	"current_url" text,
	"tags_json" text DEFAULT '[]' NOT NULL,
	"bookmarks_json" text DEFAULT '[]' NOT NULL,
	"checklist_json" text DEFAULT '{}' NOT NULL,
	"notes_json" text DEFAULT '[]' NOT NULL,
	"underwriting_json" text DEFAULT '{}' NOT NULL,
	"lead_id" integer,
	"property_id" integer,
	"assigned_to" integer,
	"assignment_due_at" timestamp,
	"assignment_status" varchar(50),
	"created_by" integer NOT NULL,
	"updated_by" integer,
	"last_opened_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_opened_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(255) NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"zip_code" varchar(10) NOT NULL,
	"beds" integer,
	"baths" integer,
	"sqft" integer,
	"price" numeric(12, 2),
	"status" varchar(50) DEFAULT 'active',
	"apn" varchar(100),
	"year_built" integer,
	"property_type" varchar(50),
	"condition" varchar(50),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"sold_price" numeric(12, 2),
	"sold_date" date,
	"rent_per_month" numeric(12, 2),
	"rented_date" date,
	"lot_size" varchar(50),
	"occupancy" varchar(50),
	"images" text[],
	"arv" numeric(12, 2),
	"repair_cost" numeric(12, 2),
	"assigned_to" integer,
	"source_lead_id" integer,
	"lead_source" varchar(100),
	"lead_source_detail" varchar(255),
	"notes" text,
	"dedupe_key" varchar(400),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rvm_audio_assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rvm_audio_assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"content_base64" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rvm_campaigns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rvm_campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"send_window_start" varchar(5),
	"send_window_end" varchar(5),
	"daily_cap" integer DEFAULT 500 NOT NULL,
	"audio_asset_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rvm_drops" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rvm_drops_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"to_number" varchar(32) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"provider_id" varchar(120),
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"owner_user_id" integer NOT NULL,
	"team_id" integer,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"share_token" varchar(64),
	"config_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skip_trace_evidence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skip_trace_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" integer NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"source_url" text,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"extracted_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"screenshot_ref" text
);
--> statement-breakpoint
CREATE TABLE "skip_trace_job_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skip_trace_job_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"message" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skip_trace_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skip_trace_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" varchar(20) NOT NULL,
	"entity_id" integer NOT NULL,
	"requested_by_user_id" integer,
	"mode" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"provider_name" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"idempotency_key" varchar(400)
);
--> statement-breakpoint
CREATE TABLE "skip_trace_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skip_trace_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer,
	"lead_id" integer,
	"property_id" integer,
	"provider_name" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"phones_json" text DEFAULT '[]' NOT NULL,
	"emails_json" text DEFAULT '[]' NOT NULL,
	"cost_cents" integer,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"cache_key" varchar(400) NOT NULL,
	"raw_response_json" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_idempotency" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_idempotency_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"idempotency_key" varchar(120) NOT NULL,
	"response_json" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(80) DEFAULT 'general',
	"legacy_task_id" integer,
	"source_db" varchar(50),
	"migration_batch_id" varchar(100),
	"related_entity_type" varchar(50),
	"related_entity_id" integer,
	"due_at" timestamp,
	"completed_at" timestamp,
	"priority" varchar(20) DEFAULT 'medium',
	"status" varchar(20) DEFAULT 'open',
	"assigned_to_user_id" integer,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" text,
	"created_by" integer NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"reminder_sent_at" timestamp,
	"overdue_alert_sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_activity_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "team_activity_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"user_id" integer,
	"action" varchar(255) NOT NULL,
	"description" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "team_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(50) DEFAULT 'member',
	"permissions" text[],
	"invited_by" integer,
	"invited_at" timestamp DEFAULT now(),
	"joined_at" timestamp,
	"status" varchar(50) DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "teams_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"description" text,
	"owner_id" integer NOT NULL,
	"invite_code" varchar(32) NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "time_clock_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "time_clock_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"employee" varchar(255) NOT NULL,
	"task" varchar(255) DEFAULT 'General' NOT NULL,
	"clock_in_at" timestamp NOT NULL,
	"clock_out_at" timestamp,
	"tz_offset_minutes" integer NOT NULL,
	"auto_started" boolean DEFAULT true,
	"auto_closed" boolean DEFAULT false NOT NULL,
	"auto_closed_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timesheet_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "timesheet_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"date" varchar(10) NOT NULL,
	"employee" varchar(255) NOT NULL,
	"task" varchar(255) NOT NULL,
	"category_id" integer,
	"linked_entity_type" varchar(32),
	"linked_entity_id" integer,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"payable_hours" numeric(5, 2),
	"hourly_rate" numeric(10, 2) DEFAULT '50',
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" integer,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"anomaly_flags" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "two_factor_auth" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "two_factor_auth_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"secret" varchar(255) NOT NULL,
	"is_enabled" boolean DEFAULT false,
	"method" varchar(50) DEFAULT 'totp',
	"phone_number" varchar(20),
	"email_backup" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "two_factor_auth_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "underwriting_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "underwriting_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"config_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_feature_flags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_feature_flags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"flag" varchar(80) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_goals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_goals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"target_value" integer NOT NULL,
	"current_value" integer DEFAULT 0,
	"unit" varchar(50) DEFAULT 'deals',
	"period" varchar(50) DEFAULT 'monthly',
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"status" varchar(50) DEFAULT 'active',
	"milestones" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"type" varchar(50) DEFAULT 'system',
	"title" varchar(255) NOT NULL,
	"description" text,
	"read" boolean DEFAULT false,
	"related_id" integer,
	"related_type" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"phone" varchar(20),
	"company_name" varchar(255),
	"license_number" varchar(100),
	"role" varchar(50) DEFAULT 'user',
	"is_super_admin" boolean DEFAULT false,
	"avatar_url" varchar(500),
	"profile_picture" text,
	"show_banner_quotes" boolean DEFAULT true,
	"custom_banner_images" text[],
	"skip_trace_default_mode" varchar(30) DEFAULT 'both' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vault_document_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vault_document_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"team_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer,
	"sha256" varchar(64),
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "work_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"default_hourly_rate" numeric(10, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "worker_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"worker_type" varchar(20) DEFAULT 'employee' NOT NULL,
	"pay_type" varchar(20) DEFAULT 'hourly' NOT NULL,
	"default_hourly_rate" numeric(10, 2),
	"salary_amount" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_blackouts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_blackouts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"experience_id" integer NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_booking_assignments" (
	"booking_id" integer PRIMARY KEY NOT NULL,
	"location_id" integer,
	"vehicle_id" integer,
	"concierge_user_id" integer,
	"assigned_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_booking_notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_booking_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"booking_id" integer NOT NULL,
	"author_user_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_bookings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_bookings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"experience_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"customer_phone" varchar(40),
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"status" varchar(40) DEFAULT 'pending_payment' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"deposit_amount" numeric(12, 2) NOT NULL,
	"stripe_checkout_session_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"stripe_customer_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_experiences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_experiences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar(80) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"mode" varchar(20) DEFAULT 'time_slot' NOT NULL,
	"payment_mode" varchar(20) DEFAULT 'deposit' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"price_total" numeric(12, 2),
	"deposit_amount" numeric(12, 2) NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"images" text[],
	"itinerary" jsonb,
	"location" text,
	"duration_minutes" integer,
	"highlights" text[],
	"inclusions" text[],
	"cancellation_policy" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"type" varchar(40) DEFAULT 'resort' NOT NULL,
	"address1" varchar(255),
	"address2" varchar(255),
	"city" varchar(120),
	"state" varchar(40),
	"zip" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_stripe_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_stripe_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_id" varchar(255) NOT NULL,
	"type" varchar(120) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_time_slots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_time_slots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"experience_id" integer NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_vehicles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "xp_vehicles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"type" varchar(40) DEFAULT 'tesla' NOT NULL,
	"license_plate" varchar(40),
	"location_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
