ALTER TABLE `review_document_caches` ADD `format_type` text;--> statement-breakpoint
ALTER TABLE `review_document_caches` ADD `include_images` integer DEFAULT 0;