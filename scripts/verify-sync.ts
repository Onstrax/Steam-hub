import { readFileSync } from "node:fs";
import path from "node:path";

import { createDatabase } from "@/lib/db";
import { createCheapSharkClient } from "@/lib/cheapshark";
import { createHltbClient } from "@/lib/hltb";
import { createProtonDbClient } from "@/lib/proton";
import { createSteamClient, getSteamConfig } from "@/lib/steam";
import { runSync } from "@/lib/sync";
import { sql } from "drizzle-orm";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  let raw = "";
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const dbPath = process.env.DATABASE_PATH ?? "steam_hub.db";
  const db = createDatabase(dbPath);
  const config = getSteamConfig();

  const maxFriendLibraries = Number(process.env.MAX_FRIEND_LIBRARIES ?? "10");

  console.log(`DB=${dbPath} steamId=${config.steamId} maxFriends=${maxFriendLibraries}`);

  const progress = await runSync(
    {
      db,
      steam: createSteamClient({ config }),
      hltb: createHltbClient(),
      proton: createProtonDbClient(),
      cheapshark: createCheapSharkClient(),
    },
    {
      steamId: config.steamId,
      enrichStoreMetadata: true,
      enrichHltb: true,
      enrichProton: true,
      enrichCheapShark: true,
      maxFriendLibraries,
      onProgress: (p) => {
        if (
          p.phase === "completed" ||
          p.phase === "failed" ||
          p.phase === "cancelled" ||
          p.phase === "proton" ||
          p.phase === "cheapshark" ||
          p.phase === "store_metadata" ||
          p.phase === "hltb" ||
          (p.phase === "friends" && p.message.includes("amigos"))
        ) {
          console.log(`[${p.percent}%] ${p.phase}: ${p.message}`);
        }
      },
    },
  );

  console.log("\n=== RESULTADO SYNC ===");
  console.log(JSON.stringify(progress, null, 2));

  const tiers = db
    .select({
      tier: sql`COALESCE(proton_db_tier, 'NULL')`,
      count: sql<number>`COUNT(*)`,
    })
    .from(sql`games`)
    .groupBy(sql`COALESCE(proton_db_tier, 'NULL')`)
    .all();

  const priceStats = db
    .select({
      withCurrent: sql<number>`SUM(CASE WHEN current_price IS NOT NULL THEN 1 ELSE 0 END)`,
      withLowest: sql<number>`SUM(CASE WHEN lowest_price IS NOT NULL THEN 1 ELSE 0 END)`,
      multiplayer: sql<number>`SUM(CASE WHEN max_players > 1 THEN 1 ELSE 0 END)`,
    })
    .from(sql`games`)
    .get();

  const friendsCount = db.select({ count: sql<number>`COUNT(*)` }).from(sql`friends`).get();
  const friendGamesCount = db.select({ count: sql<number>`COUNT(*)` }).from(sql`friend_games`).get();

  const samples = db
    .select({
      appid: sql<number>`games.appid`,
      name: sql<string>`games.name`,
      protonDbTier: sql<string | null>`games.proton_db_tier`,
      currentPrice: sql<string | null>`games.current_price`,
      initialPrice: sql<string | null>`games.initial_price`,
      discountPercent: sql<number | null>`games.discount_percent`,
      lowestPrice: sql<string | null>`games.lowest_price`,
      lowestDiscountPercent: sql<number | null>`games.lowest_discount_percent`,
      lowestPriceDate: sql<string | null>`games.lowest_price_date`,
      minPlayers: sql<number | null>`games.min_players`,
      maxPlayers: sql<number | null>`games.max_players`,
    })
    .from(sql`games`)
    .where(sql`games.proton_db_tier IS NOT NULL AND games.proton_db_tier != 'UNKNOWN'`)
    .limit(8)
    .all();

  const priceSamples = db
    .select({
      appid: sql<number>`games.appid`,
      name: sql<string>`games.name`,
      currentPrice: sql<string | null>`games.current_price`,
      initialPrice: sql<string | null>`games.initial_price`,
      discountPercent: sql<number | null>`games.discount_percent`,
      lowestPrice: sql<string | null>`games.lowest_price`,
      lowestDiscountPercent: sql<number | null>`games.lowest_discount_percent`,
      lowestPriceDate: sql<string | null>`games.lowest_price_date`,
    })
    .from(sql`games`)
    .where(sql`games.lowest_price IS NOT NULL OR games.current_price IS NOT NULL`)
    .limit(8)
    .all();

  console.log("\n=== TIERS PROTONDB ===");
  console.log(tiers);
  console.log("\n=== CONTADORES ===");
  console.log(priceStats, { friends: friendsCount, friendGames: friendGamesCount });
  console.log("\n=== MUESTRAS CON TIER ===");
  console.table(samples);
  console.log("\n=== MUESTRAS CON PRECIOS ===");
  console.table(priceSamples);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
