CREATE TABLE `exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location_type` text NOT NULL,
	`equipment_required` text NOT NULL,
	`min_duration` integer NOT NULL,
	`joint_stress_rating` integer NOT NULL,
	`muscle_groups` text NOT NULL,
	`progression_ladder` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_name_unique` ON `exercises` (`name`);