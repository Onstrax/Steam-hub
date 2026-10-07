import type { SteamHubDatabase } from "@/lib/db";
import { getDb } from "@/lib/db";
import { createCheapSharkClient } from "@/lib/cheapshark";
import { createHltbClient } from "@/lib/hltb";
import { createProtonDbClient } from "@/lib/proton";
import type { SyncDependencies } from "@/lib/sync";
import { createSteamClient, getSteamConfig } from "@/lib/steam";

let overrides: Partial<SyncDependencies> | null = null;

export function setSyncDependencies(next: Partial<SyncDependencies> | null): void {
  overrides = next;
}

export function resolveDb(): SteamHubDatabase {
  return overrides?.db ?? getDb();
}

export function resolveSyncDependencies(): SyncDependencies {
  return {
    db: resolveDb(),
    steam: overrides?.steam ?? createSteamClient({ config: getSteamConfig() }),
    hltb: overrides?.hltb ?? createHltbClient(),
    proton: overrides?.proton ?? createProtonDbClient(),
    cheapshark: overrides?.cheapshark ?? createCheapSharkClient(),
  };
}
