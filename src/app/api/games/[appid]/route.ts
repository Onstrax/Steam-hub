import { NextResponse } from "next/server";

import { USER_STATUS_VALUES } from "@/lib/games-query";
import { games, type UserStatus } from "@/lib/db/schema";
import { resolveDb } from "@/lib/sync-deps";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { appid: string };
}

export async function PATCH(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const appid = Number(params.appid);
  if (!Number.isInteger(appid) || appid <= 0) {
    return NextResponse.json(
      { error: "Identificador de juego inválido", param: "appid" },
      { status: 400 },
    );
  }

  let body: { userStatus?: unknown };
  try {
    const raw = await request.text();
    body = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const userStatus = body.userStatus;
  if (typeof userStatus !== "string" || !USER_STATUS_VALUES.includes(userStatus as UserStatus)) {
    return NextResponse.json(
      {
        error: `Estado inválido: userStatus admite ${USER_STATUS_VALUES.join(", ")}`,
        param: "userStatus",
      },
      { status: 400 },
    );
  }

  try {
    const db = resolveDb();
    const updated = await db
      .update(games)
      .set({ userStatus: userStatus as UserStatus })
      .where(eq(games.appid, appid))
      .run();

    if (updated.changes === 0) {
      return NextResponse.json(
        { error: "Juego no encontrado", param: "appid" },
        { status: 404 },
      );
    }

    return NextResponse.json({ appid, userStatus: userStatus as UserStatus });
  } catch (error) {
    console.error(`PATCH /api/games/${appid} falló:`, error);
    return NextResponse.json({ error: "No se pudo actualizar el juego" }, { status: 500 });
  }
}
