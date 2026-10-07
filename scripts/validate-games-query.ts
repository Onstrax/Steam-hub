import { db } from "@/lib/db";
import { queryGames, parseGamesQuery } from "@/lib/games-query";

async function run(label: string, params: string, limit = 6) {
  const started = performance.now();
  const list = await queryGames(db, parseGamesQuery(new URLSearchParams(params)));
  const ms = performance.now() - started;

  console.log(`\n== ${label} (${params || "sin filtros"}) ==`);
  console.log(`   count=${list.length} tiempo=${ms.toFixed(2)}ms`);
  for (const game of list.slice(0, limit)) {
    console.log(
      `   ${game.appid}  ${game.name}  playtime=${game.playtimeForever}  hltb=${game.hltbMainStory}  ctrl=${game.controllerSupport ?? "null"}  proton=${game.protonDbTier}  price=${game.currentPrice ?? "null"}  cats=[${game.categories.join(", ")}]  friends=[${game.friends.map((f) => f.personaname ?? f.steamid).join(", ")}]`,
    );
  }
}

async function main() {
  await run("búsqueda portal", "search=portal");
await run("hltb corto", "maxHltb=5");
await run("géneros Action+Indie", "genres=Action,Indie");
await run("mando full+partial", "controllerSupport=full,partial");
await run("playtime alto", "minPlaytime=1000", 8);
await run("orden por playtime desc", "sortBy=playtime&sortOrder=desc", 8);
await run("intersección de amigos", "friendIds=76561190000000001,76561190000000002");
await run("proton GOLD/NATIVE", "protonDbTier=GOLD,NATIVE");
await run("combinado", "search=co&isLocalCoop=true&maxHltb=50&minPlayers=1");
  await run("orden por revisión desc", "sortBy=review&sortOrder=desc", 5);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
