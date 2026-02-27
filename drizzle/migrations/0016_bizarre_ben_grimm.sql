ALTER TABLE `review_document_caches` ADD `text_token_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `review_document_caches` DROP COLUMN `text_character_count`;