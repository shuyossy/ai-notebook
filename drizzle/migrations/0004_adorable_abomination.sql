CREATE TABLE `review_checklist_results` (
	`review_checklist_id` integer NOT NULL,
	`file_id` text NOT NULL,
	`file_name` text NOT NULL,
	`evaluation` text NOT NULL,
	`comment` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`review_checklist_id`, `file_id`),
	FOREIGN KEY (`review_checklist_id`) REFERENCES `review_checklists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `review_checklist_sources`;