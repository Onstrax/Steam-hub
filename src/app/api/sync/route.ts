import { NextResponse } from "next/server";

import {
  cancelRunningJob,
  getRunningJob,
  readStoredProgress,
  startSyncJob,
  SyncAlreadyRunningError,
  type SyncProgress,
} from "@/lib/sync";
import { resolveDb, resolveSyncDependencies } from "@/lib/sync-deps";
import { getSteamConfig, SteamConfigError } from "@/lib/steam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { enrichStoreMetadata?: boolean; enrichHltb?: boolean; maxFriendLibraries?: number } = {};

  try {
    const raw = await request.text();
    body = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  try {
    const config = getSteamConfig();
    const running = getRunningJob();

    if (running) {
      return NextResponse.json(
        {
          error: "Ya hay una sincronización en curso",
          jobId: running.jobId,
          progress: running.progress ?? (await readProgressSync()),
        },
        { status: 409 },
      );
    }

    const { jobId } = startSyncJob(
      resolveSyncDependencies(),
      {
        steamId: config.steamId,
        enrichStoreMetadata: body.enrichStoreMetadata !== false,
        enrichHltb: body.enrichHltb !== false,
        maxFriendLibraries: normalizeMaxFriends(body.maxFriendLibraries),
      },
    );

    return NextResponse.json(
      {
        jobId,
        status: "running",
        message: "Sincronización iniciada",
        poll: "/api/sync",
      },
      { status: 202 },
    );
  } catch (error) {
    return handleStartError(error);
  }
}

export async function GET(): Promise<NextResponse> {
  const running = getRunningJob();

  if (running) {
    return NextResponse.json({
      jobId: running.jobId,
      running: true,
      progress: running.progress ?? (await readProgressSync()),
    });
  }

  const stored = await readStoredProgress(resolveDb());
  return NextResponse.json({ running: false, progress: stored });
}

export async function DELETE(): Promise<NextResponse> {
  const cancelled = cancelRunningJob();

  return NextResponse.json(
    cancelled
      ? { cancelled: true, message: "Sincronización cancelada" }
      : { cancelled: false, message: "No hay ninguna sincronización en curso" },
    { status: cancelled ? 202 : 409 },
  );
}

async function readProgressSync(): Promise<SyncProgress | null> {
  try {
    return await readStoredProgress(resolveDb());
  } catch {
    return null;
  }
}

function normalizeMaxFriends(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.trunc(parsed);
}

function handleStartError(error: unknown): NextResponse {
  if (error instanceof SyncAlreadyRunningError) {
    return NextResponse.json({ error: error.message, jobId: error.jobId }, { status: 409 });
  }

  if (error instanceof SteamConfigError) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "No se pudo iniciar la sincronización" },
    { status: 500 },
  );
}