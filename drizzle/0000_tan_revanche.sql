CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`appid` integer,
	`name` text,
	FOREIGN KEY (`appid`) REFERENCES `games`(`appid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `friend_games` (
	`steamid` text NOT NULL,
	`appid` integer NOT NULL,
	PRIMARY KEY(`steamid`, `appid`),
	FOREIGN KEY (`steamid`) REFERENCES `friends`(`steamid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appid`) REFERENCES `games`(`appid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `friends` (
	`steamid` text PRIMARY KEY NOT NULL,
	`personaname` text,
	`avatarfull` text
);
--> statement-breakpoint
CREATE TABLE `games` (
	`appid` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`img_icon_url` text,
	`playtime_forever` integer DEFAULT 0,
	`user_status` text DEFAULT 'Backlog',
	`is_free` integer DEFAULT false,
	`required_age` integer DEFAULT 0,
	`short_description` text,
	`header_image` text,
	`controller_support` text,
	`min_players` integer DEFAULT 1,
	`max_players` integer DEFAULT 1,
	`is_local_coop` integer DEFAULT false,
	`is_split_screen` integer DEFAULT false,
	`is_multiplayer` integer DEFAULT false,
	`steam_deck_status` text,
	`review_score` integer DEFAULT 0,
	`disk_space_gb` real DEFAULT 0,
	`hltb_main_story` real DEFAULT 0,
	`hltb_main_extra` real DEFAULT 0,
	`hltb_completionist` real DEFAULT 0,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
