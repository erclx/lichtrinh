CREATE TABLE `transcriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`outcome` text NOT NULL,
	`audio_ms` integer,
	`transcribe_ms` integer NOT NULL,
	`characters` integer,
	`sent_message_id` text,
	`edit_ratio` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transcriptions_model_idx` ON `transcriptions` (`model`);