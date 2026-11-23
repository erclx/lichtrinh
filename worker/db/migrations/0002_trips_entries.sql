CREATE TABLE `changes` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`op` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before` text,
	`after` text,
	`undoes` text,
	`rezoned_entry_ids` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `changes_seq_idx` ON `changes` (`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `changes_undoes_idx` ON `changes` (`undoes`);--> statement-breakpoint
CREATE INDEX `changes_trip_id_seq_idx` ON `changes` (`trip_id`,`seq`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`kind` text,
	`starts_on` text NOT NULL,
	`start_time` text NOT NULL,
	`ends_on` text NOT NULL,
	`end_time` text NOT NULL,
	`time_zone` text NOT NULL,
	`cost_minor` integer,
	`version` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_source` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entries_trip_id_starts_on_idx` ON `entries` (`trip_id`,`starts_on`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`time_zone` text NOT NULL,
	`currency` text NOT NULL,
	`home_currency` text NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer
);
