CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`status` text NOT NULL,
	`model` text,
	`change_ids` text DEFAULT '[]' NOT NULL,
	`reply_to` text,
	`held_removal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_chat_id_created_at_idx` ON `chat_messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_reply_to_idx` ON `chat_messages` (`reply_to`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chats_owner_id_updated_at_idx` ON `chats` (`owner_id`,`updated_at`);