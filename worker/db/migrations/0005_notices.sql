CREATE TABLE `notify_emails` (
	`user_id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`time_zone` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outage_notices` (
	`kind` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`user_id` text NOT NULL,
	`claimed_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_devices` (
	`session_id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_endpoint_unique` ON `push_devices` (`endpoint`);