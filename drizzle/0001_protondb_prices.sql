ALTER TABLE `games` RENAME COLUMN `steam_deck_status` TO `proton_db_tier`;--> statement-breakpoint
ALTER TABLE `games` ADD `current_price` text;--> statement-breakpoint
ALTER TABLE `games` ADD `initial_price` text;--> statement-breakpoint
ALTER TABLE `games` ADD `discount_percent` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `lowest_price` text;--> statement-breakpoint
ALTER TABLE `games` ADD `lowest_discount_percent` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `lowest_price_date` text;
