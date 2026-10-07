import { relations } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export type UserStatus = "Backlog" | "Playing" | "Completed" | "Abandoned";
export type ControllerSupport = "full" | "partial" | "none";
export type ProtonDbTier =
  | "NATIVE"
  | "PLATINUM"
  | "GOLD"
  | "SILVER"
  | "BRONZE"
  | "BORKED"
  | "UNKNOWN";

export const PROTON_DB_TIERS: ProtonDbTier[] = [
  "NATIVE",
  "PLATINUM",
  "GOLD",
  "SILVER",
  "BRONZE",
  "BORKED",
  "UNKNOWN",
];

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const games = sqliteTable("games", {
  appid: integer("appid").primaryKey(),
  name: text("name").notNull(),
  imgIconUrl: text("img_icon_url"),
  playtimeForever: integer("playtime_forever").default(0),
  userStatus: text("user_status").$type<UserStatus>().default("Backlog"),

  isFree: integer("is_free", { mode: "boolean" }).default(false),
  requiredAge: integer("required_age").default(0),
  shortDescription: text("short_description"),
  headerImage: text("header_image"),
  controllerSupport: text("controller_support").$type<ControllerSupport>(),
  minPlayers: integer("min_players").default(1),
  maxPlayers: integer("max_players").default(1),
  isLocalCoop: integer("is_local_coop", { mode: "boolean" }).default(false),
  isSplitScreen: integer("is_split_screen", { mode: "boolean" }).default(false),
  isMultiplayer: integer("is_multiplayer", { mode: "boolean" }).default(false),
  protonDbTier: text("proton_db_tier").$type<ProtonDbTier>(),
  reviewScore: integer("review_score").default(0),
  diskSpaceGb: real("disk_space_gb").default(0),

  currentPrice: text("current_price"),
  initialPrice: text("initial_price"),
  discountPercent: integer("discount_percent"),
  lowestPrice: text("lowest_price"),
  lowestDiscountPercent: integer("lowest_discount_percent"),
  lowestPriceDate: text("lowest_price_date"),

  hltbMainStory: real("hltb_main_story").default(0),
  hltbMainExtra: real("hltb_main_extra").default(0),
  hltbCompletionist: real("hltb_completionist").default(0),

  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appid: integer("appid").references(() => games.appid),
  name: text("name"),
});

export const friends = sqliteTable("friends", {
  steamid: text("steamid").primaryKey(),
  personaname: text("personaname"),
  avatarfull: text("avatarfull"),
});

export const friendGames = sqliteTable(
  "friend_games",
  {
    steamid: text("steamid")
      .notNull()
      .references(() => friends.steamid),
    appid: integer("appid")
      .notNull()
      .references(() => games.appid),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.steamid, table.appid] }),
  }),
);

export const friendsRelations = relations(friends, ({ many }) => ({
  friendGames: many(friendGames),
}));

export const friendGamesRelations = relations(friendGames, ({ one }) => ({
  friend: one(friends, {
    fields: [friendGames.steamid],
    references: [friends.steamid],
  }),
  game: one(games, {
    fields: [friendGames.appid],
    references: [games.appid],
  }),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  categories: many(categories),
  friendGames: many(friendGames),
}));

export const categoriesRelations = relations(categories, ({ one }) => ({
  game: one(games, {
    fields: [categories.appid],
    references: [games.appid],
  }),
}));

export type Setting = typeof settings.$inferSelect;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Friend = typeof friends.$inferSelect;
export type FriendGame = typeof friendGames.$inferSelect;