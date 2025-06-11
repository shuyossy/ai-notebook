CREATE TABLE `review_checklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_history_id` integer NOT NULL,
	`content` text NOT NULL,
	`evaluation` text,
	`comment` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`review_history_id`) REFERENCES `review_histories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_histories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_history_sources` (
	`review_history_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`review_history_id`, `source_id`),
	FOREIGN KEY (`review_history_id`) REFERENCES `review_histories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
