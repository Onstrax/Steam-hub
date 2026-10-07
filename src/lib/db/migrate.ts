import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";

import type { SteamHubDatabase } from "./index";

export function getMigrationsFolder(): string {
  return process.env.DRIZZLE_MIGRATIONS_FOLDER ?? path.join(process.cwd(), "drizzle");
}

export function runMigrations(db: SteamHubDatabase, folder: string = getMigrationsFolder()): void {
  migrate(db, { migrationsFolder: folder });
}