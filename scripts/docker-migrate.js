/**
 * Aplica las migraciones de Drizzle al arrancar el contenedor.
 * Script plano (CJS) pensado para la imagen de producción.
 */
const fs = require("node:fs");
const path = require("node:path");

const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "steam_hub.db");
const migrationsFolder =
  process.env.DRIZZLE_MIGRATIONS_FOLDER || path.join(process.cwd(), "drizzle");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder });

sqlite.close();
console.log(`Migraciones aplicadas correctamente en ${dbPath}`);
