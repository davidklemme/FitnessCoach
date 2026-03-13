CREATE TABLE `health_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`sleep_quality` integer,
	`energy_level` integer,
	`soreness_level` integer,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_observations_date_unique` ON `health_observations` (`date`);--> statement-breakpoint
CREATE INDEX `idx_health_observations_date` ON `health_observations` (`date`);--> statement-breakpoint
CREATE TABLE `injury_status_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`pain_level` integer NOT NULL,
	`location` text NOT NULL,
	`trigger_exercise_id` integer,
	`severity` text,
	`affected_areas_json` text,
	`escalation_stage` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trigger_exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_injury_status_log_date` ON `injury_status_log` (`date`);--> statement-breakpoint
CREATE INDEX `idx_injury_status_log_trigger_exercise_id` ON `injury_status_log` (`trigger_exercise_id`);