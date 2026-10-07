import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";

import * as schema from "./schema";

export type SteamHubDatabase = BetterSQLite3Database<typeof schema>;

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "steam_hub.db");
}

export function createDatabase(dbPath: string = getDatabasePath()): SteamHubDatabase {
  // const sqlite = new Database(dbPath);
  const sqlite = new Database(dbPath, {
    timeout: 5000, // Espera hasta 5 segundos si la base de datos está ocupada antes de fallar
  });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as unknown as {
  __steamHubDb?: SteamHubDatabase;
};

export function getDb(): SteamHubDatabase {
  if (!globalForDb.__steamHubDb) {
    globalForDb.__steamHubDb = createDatabase();
  }
  return globalForDb.__steamHubDb;
}

export const db: SteamHubDatabase = getDb();
export { schema };