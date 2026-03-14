CREATE TABLE `plan_session_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`sets` integer NOT NULL,
	`reps` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`plan_session_id`) REFERENCES `plan_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plan_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`session_type` text NOT NULL,
	`day_of_week` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mesocycle_name` text NOT NULL,
	`phase` text NOT NULL,
	`week_number` integer NOT NULL,
	`status` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` text NOT NULL
);
