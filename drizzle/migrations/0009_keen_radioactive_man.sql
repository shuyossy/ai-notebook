CREATE TABLE `review_checklist_result_caches` (
	`review_document_cache_id` integer NOT NULL,
	`review_checklist_id` integer NOT NULL,
	`comment` text NOT NULL,
	PRIMARY KEY(`review_document_cache_id`, `review_checklist_id`),
	FOREIGN KEY (`review_document_cache_id`) REFERENCES `review_document_caches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_checklist_id`) REFERENCES `review_checklists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_document_caches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_history_id` text NOT NULL,
	`document_id` text NOT NULL,
	`original_file_name` text NOT NULL,
	`file_name` text NOT NULL,
	`process_mode` text NOT NULL,
	`cache_path` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`review_history_id`) REFERENCES `review_histories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `review_histories` ADD `document_mode` text;