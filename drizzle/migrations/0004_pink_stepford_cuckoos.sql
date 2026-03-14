CREATE INDEX `idx_plan_session_exercises_session_id` ON `plan_session_exercises` (`plan_session_id`);--> statement-breakpoint
CREATE INDEX `idx_plan_session_exercises_exercise_id` ON `plan_session_exercises` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `idx_plan_sessions_plan_id` ON `plan_sessions` (`plan_id`);