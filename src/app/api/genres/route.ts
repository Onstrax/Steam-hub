import { isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { categories } from "@/lib/db/schema";
import { resolveDb } from "@/lib/sync-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const db = resolveDb();
    const rows = await db
      .selectDistinct({ name: categories.name })
      .from(categories)
      .where(isNotNull(categories.name))
      .orderBy(sql`lower(${categories.name})`)
      .all();

    const genres = rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);

    return NextResponse.json({ count: genres.length, genres });
  } catch (error) {
    console.error("GET /api/genres falló:", error);
    return NextResponse.json({ error: "No se pudieron cargar los géneros" }, { status: 500 });
  }
}
