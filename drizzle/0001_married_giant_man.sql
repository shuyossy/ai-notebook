ALTER TABLE `sources` ADD `status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `error` text;