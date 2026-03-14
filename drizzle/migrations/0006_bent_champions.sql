CREATE TABLE `session_log_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_log_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`sets` integer NOT NULL,
	`reps` text NOT NULL,
	`weight` text,
	`rpe_per_exercise` integer,
	`notes` text,
	FOREIGN KEY (`session_log_id`) REFERENCES `session_logs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_session_log_entries_session_log_id` ON `session_log_entries` (`session_log_id`);--> statement-breakpoint
CREATE INDEX `idx_session_log_entries_exercise_id` ON `session_log_entries` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `session_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`session_type` text NOT NULL,
	`session_order` integer DEFAULT 1 NOT NULL,
	`rpe` integer,
	`prehab_completed` integer,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_session_logs_unique` ON `session_logs` (`date`,`session_type`,`session_order`);