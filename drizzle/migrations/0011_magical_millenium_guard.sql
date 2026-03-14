CREATE TABLE `scheduling_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`earliest_time` text DEFAULT '06:00' NOT NULL,
	`latest_time` text DEFAULT '20:00' NOT NULL,
	`meeting_buffer_minutes` integer DEFAULT 60 NOT NULL,
	`blackout_patterns_json` text,
	`updated_at` text NOT NULL
);
