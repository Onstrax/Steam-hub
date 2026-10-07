import { asc, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { friendGames, friends } from "@/lib/db/schema";
import { resolveDb } from "@/lib/sync-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const db = resolveDb();
    const rows = await db
      .select({
        steamid: friends.steamid,
        personaname: friends.personaname,
        avatarfull: friends.avatarfull,
        gameCount: sql<number>`coalesce(${count(friendGames.appid)}, 0)`,
      })
      .from(friends)
      .leftJoin(friendGames, eq(friends.steamid, friendGames.steamid))
      .groupBy(friends.steamid)
      .orderBy(sql`lower(coalesce(${friends.personaname}, ''))`, asc(friends.steamid))
      .all();

    return NextResponse.json({ count: rows.length, friends: rows });
  } catch (error) {
    console.error("GET /api/friends falló:", error);
    return NextResponse.json({ error: "No se pudieron cargar los amigos" }, { status: 500 });
  }
}
