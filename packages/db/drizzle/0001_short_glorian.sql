CREATE TYPE "public"."artifact_type" AS ENUM('story', 'epic', 'project', 'architecture_plan', 'requirement_set', 'evidence_bundle', 'verification_result', 'release_candidate');--> statement-breakpoint
CREATE TYPE "public"."promotion_stage" AS ENUM('draft', 'planned', 'requirements_ready', 'architecture_ready', 'build_ready', 'in_execution', 'built', 'verified', 'release_candidate', 'approved_for_delivery', 'delivered', 'post_delivery_review');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('derived_from', 'decomposed_from', 'verified_by', 'supersedes', 'implements');--> statement-breakpoint
CREATE TABLE "artifact_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_type" "artifact_type" NOT NULL,
	"artifact_id" text NOT NULL,
	"artifact_version" integer NOT NULL,
	"evaluation_model" text NOT NULL,
	"overall_score" numeric(5, 2) NOT NULL,
	"dimension_scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_llm_response" jsonb NOT NULL,
	"evaluated_by" text NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_lineage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_type" "artifact_type" NOT NULL,
	"parent_id" text NOT NULL,
	"child_type" "artifact_type" NOT NULL,
	"child_id" text NOT NULL,
	"relationship_type" "relationship_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "artifact_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_type" "artifact_type" NOT NULL,
	"artifact_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "gate_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_stage" "promotion_stage" NOT NULL,
	"to_stage" "promotion_stage" NOT NULL,
	"required_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_pass_threshold" numeric(5, 2),
	"disqualifying_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"org_id" uuid,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_type" "artifact_type" NOT NULL,
	"artifact_id" text NOT NULL,
	"from_stage" "promotion_stage" NOT NULL,
	"to_stage" "promotion_stage" NOT NULL,
	"triggered_by" uuid NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evaluation_id" uuid,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "story_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" text NOT NULL,
	"sprint_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"total_duration_ms" integer NOT NULL,
	"llm_calls" integer NOT NULL,
	"total_tokens_input" integer NOT NULL,
	"total_tokens_output" integer NOT NULL,
	"sandbox_runs" integer NOT NULL,
	"rework_cycles" integer NOT NULL,
	"revision_contributions" integer NOT NULL,
	"cost_estimate_usd" numeric(12, 4) NOT NULL,
	"agent_durations_ms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "velocity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"sprint_id" uuid NOT NULL,
	"completed_points" integer NOT NULL,
	"planned_points" integer NOT NULL,
	"completed_stories" integer NOT NULL,
	"planned_stories" integer NOT NULL,
	"sprint_duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact_evaluations" ADD CONSTRAINT "artifact_evaluations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_evaluations" ADD CONSTRAINT "artifact_evaluations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_definitions" ADD CONSTRAINT "gate_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_definitions" ADD CONSTRAINT "gate_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_evaluation_id_artifact_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."artifact_evaluations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_metrics" ADD CONSTRAINT "story_metrics_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_metrics" ADD CONSTRAINT "story_metrics_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_metrics" ADD CONSTRAINT "story_metrics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "velocity_snapshots" ADD CONSTRAINT "velocity_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "velocity_snapshots" ADD CONSTRAINT "velocity_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "velocity_snapshots" ADD CONSTRAINT "velocity_snapshots_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;