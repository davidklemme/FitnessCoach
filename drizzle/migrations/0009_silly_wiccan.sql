CREATE TABLE `benchmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_component` text NOT NULL,
	`target_value` text NOT NULL,
	`current_value` text,
	`unit` text NOT NULL,
	`last_tested_date` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `benchmarks_goal_component_unique` ON `benchmarks` (`goal_component`);