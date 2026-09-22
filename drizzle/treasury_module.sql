-- Tesouraria (módulo financeiro) — aplicar com db:push ou psql.
-- Idempotente o máximo possível (IF NOT EXISTS).

CREATE TYPE "public"."bank_account_type" AS ENUM('checking', 'savings', 'internal', 'other');
--> statement-breakpoint
CREATE TYPE "public"."finance_direction" AS ENUM('credit', 'debit');
--> statement-breakpoint
CREATE TYPE "public"."finance_recurrence" AS ENUM('none', 'weekly', 'biweekly', 'monthly', 'bimonthly');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chart_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(200) NOT NULL,
	"synthetic_name" varchar(200),
	"dfc_group_1" varchar(120),
	"dfc_group_2" varchar(120),
	"dre_group_1" varchar(120),
	"dre_group_2" varchar(120),
	"include_in_fcd" boolean DEFAULT true NOT NULL,
	"include_in_fcm" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(120) NOT NULL,
	"institution" varchar(120),
	"account_type" "bank_account_type" DEFAULT 'checking' NOT NULL,
	"bank_code" varchar(32),
	"opening_balance_cents" integer DEFAULT 0 NOT NULL,
	"opening_balance_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "treasury_payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"code" varchar(40),
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "credit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(120) NOT NULL,
	"institution" varchar(120),
	"limit_cents" integer DEFAULT 0 NOT NULL,
	"closing_day" integer DEFAULT 1 NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "card_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"direction" "finance_direction" NOT NULL,
	"description" varchar(300) NOT NULL,
	"party_name" varchar(200),
	"client_id" uuid,
	"chart_account_id" uuid,
	"bank_account_id" uuid,
	"treasury_payment_method_id" uuid,
	"credit_card_id" uuid,
	"card_invoice_id" uuid,
	"cost_center" varchar(120),
	"doc_type" varchar(60),
	"doc_number" varchar(80),
	"issue_date" date,
	"due_date" date,
	"settled_at" timestamp with time zone,
	"forecast_cents" integer,
	"budget_cents" integer,
	"actual_cents" integer,
	"installment_index" integer,
	"installment_total" integer,
	"recurrence" "finance_recurrence" DEFAULT 'none' NOT NULL,
	"parent_entry_id" uuid,
	"is_forecast_only" boolean DEFAULT false NOT NULL,
	"reconciled_at" timestamp with time zone,
	"notes" text,
	"external_source" varchar(40),
	"external_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance_entry_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"finance_entry_id" uuid NOT NULL,
	"order_id" uuid,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "treasury_bridge_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"method_codes" text DEFAULT '["pix","cash","debit","credit","transfer"]' NOT NULL,
	"default_chart_account_code" varchar(32) DEFAULT '121',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treasury_bridge_settings_tenant_id_unique" UNIQUE("tenant_id")
);
