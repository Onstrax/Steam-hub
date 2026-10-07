import { NextResponse } from "next/server";

import { GamesQueryError, parseGamesQuery, queryGames } from "@/lib/games-query";
import { resolveDb } from "@/lib/sync-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const query = parseGamesQuery(new URL(request.url).searchParams);
    const gameList = await queryGames(resolveDb(), query);

    return NextResponse.json({
      count: gameList.length,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      games: gameList,
    });
  } catch (error) {
    if (error instanceof GamesQueryError) {
      return NextResponse.json(
        { error: error.message, param: error.param },
        { status: 400 },
      );
    }

    console.error("GET /api/games falló:", error);
    return NextResponse.json({ error: "No se pudo consultar la biblioteca" }, { status: 500 });
  }
}
