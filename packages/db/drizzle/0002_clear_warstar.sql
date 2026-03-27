ALTER TYPE "public"."artifact_type" ADD VALUE 'product_goal';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'increment';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'sprint_review';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'retrospective';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'delivery_record';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'sbom_manifest';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'provenance_attestation';--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'post_delivery_review';--> statement-breakpoint
CREATE TABLE "delivery_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"release_candidate_id" text,
	"increment_id" text,
	"environment" text NOT NULL,
	"deployed_version" text NOT NULL,
	"deployment_window" jsonb,
	"approved_by" uuid,
	"deployment_result" text DEFAULT 'pending' NOT NULL,
	"rollback_reference" text,
	"evidence_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"problem_statement" text DEFAULT '' NOT NULL,
	"target_users" text DEFAULT '' NOT NULL,
	"success_measures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"business_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"non_goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by" uuid,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"source_artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "readiness" text DEFAULT 'not_ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_goals" ADD CONSTRAINT "product_goals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_goals" ADD CONSTRAINT "product_goals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_goals" ADD CONSTRAINT "product_goals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;