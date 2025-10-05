DROP TABLE `review_checklist_results`;--> statement-breakpoint
ALTER TABLE `review_checklists` ADD `evaluation` text;--> statement-breakpoint
ALTER TABLE `review_checklists` ADD `comment` text;--> statement-breakpoint
ALTER TABLE `review_histories` ADD `target_document_name` text;