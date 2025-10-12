CREATE TABLE `review_largedocument_result_caches` (
	`review_document_cache_id` integer NOT NULL,
	`review_checklist_id` integer NOT NULL,
	`comment` text NOT NULL,
	`total_chunks` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`individual_file_name` text NOT NULL,
	PRIMARY KEY(`review_document_cache_id`, `review_checklist_id`, `chunk_index`),
	FOREIGN KEY (`review_document_cache_id`) REFERENCES `review_document_caches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_checklist_id`) REFERENCES `review_checklists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `review_checklist_result_caches`;--> statement-breakpoint
ALTER TABLE `review_document_caches` DROP COLUMN `original_file_name`;