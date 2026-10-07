# Lista de Tareas de Implementación (Tasks)

- [x] **Tarea 1: Setup Inicial del Proyecto y Base de Datos**
  - Inicializar Next.js con TypeScript y Tailwind CSS.
  - Instalar dependencias: `drizzle-orm`, `better-sqlite3`, `@lucide/react`, `howlongtobeat`, `clsx`, `tailwind-merge`.
    - Nota: el cliente HLTB (`src/lib/hltb.ts`) implementa la API web actual de howlongtobeat.com; el paquete npm `howlongtobeat` responde `403` y no se utiliza.
  - Crear el cliente de DB SQLite y definir el schema Drizzle según `architecture.md`.
  - Ejecutar migraciones iniciales para generar `steam_hub.db`.

- [x] **Tarea 2: Módulo de Integración con Steam API y HLTB**
  - Crear servicio `lib/steam.ts` para obtener juegos del usuario (`GetOwnedGames`) y lista de amigos (`GetFriendList`).
  - Crear scraper/fetcher de Steam Store API con delay (rate limiting) para extraer categorías, co-op local, pantalla partida, soporte de control y número de jugadores.
  - Crear servicio `lib/hltb.ts` para consultar las duraciones en horas de HowLongToBeat.
  - Crear API Route `POST /api/sync` para ejecutar la sincronización de manera asíncrona enviando avances de progreso.

- [x] **Tarea 3: API Route de Lectura y Filtrado Avanzado**
  - Crear API Route `GET /api/games` que acepte los siguientes query params:
    - `search`, `minPlaytime`, `maxPlaytime`, `maxHltb`, `isLocalCoop`, `isSplitScreen`, `controllerSupport`, `minPlayers`, `maxPlayers`, `friendIds`, `genres`, `protonDbTier`, `userStatus`, `minReview`, `sortBy`, `sortOrder`.
  - Construir las consultas SQL optimizadas con Drizzle ORM para retornar la lista filtrada de juegos.
  - Semántica elegida (sin referencia explícita en `requirements.md`): `genres` = OR; `friendIds` = AND (intersección); `minPlayers`/`maxPlayers` = intersección del rango soportado por el juego; rangos HLTB exigen `hltb_main_story > 0`; booleanos aceptan `true/1/yes/on`; enums inválidos o valores no numéricos responden `400`; `sortBy` restringido a `name|playtime|hltb|review|maxPlayers|updated` (orden por defecto `name asc`, tiebreaker `appid`); extra `minHltb` para completar el rango RF2.2.
  - Validado con datos reales (`scripts/validate-games-query.ts` sobre `steam_hub.db`): 146 juegos, consultas de 0.4–6.6 ms (< 100 ms, RNF3). `friendIds` y `protonDbTier` solo pueden verificarse con datos sembrados (la BD real tiene amigos vacíos y tier UNKNOWN).

- [x] **Tarea 4: Componentes de Interfaz de Usuario (UI)**
  - Configurar Tailwind (tema Steam: `#66c0f4`/`#1b2838`) y componentes base en `src/components/ui/` (`button`, `badge`, `checkbox`, `select`, `dual-range-slider`, `multi-select`, `progress-bar`, `segmented-control`, `spinner`) con utilidad `cn()`.
  - Construir el panel lateral de filtros (`filters-sidebar.tsx`): búsqueda, sliders duales de horas jugadas/HLTB/jugadores, checkboxes de Co-op local y Pantalla partida, dropdowns de mando y ProtonDB, selector múltiple de amigos y de géneros/etiquetas, y controles de orden.
  - Crear la vista principal `src/app/page.tsx` con selector Tabla/Cuadrícula, `game-card.tsx` (carátula, badges, amigos) y `game-table.tsx` (`@tanstack/react-table` v9 con ordenamiento por columnas).
  - Integrar el botón de Sincronización Manual (`sync-button.tsx`) en la barra superior: `POST /api/sync`, sondeo de `GET /api/sync` con barra de progreso, cancelación vía `DELETE` y recarga de la biblioteca al finalizar.
  - Nuevas rutas de metadatos para la UI: `GET /api/friends` (amigos con conteo de juegos) y `GET /api/genres` (categorías/etiquetas distintas).
  - Lógica de filtros client-side en `src/lib/filters-state.ts` (horas→minutos, listas CSV, recuento de filtros activos) y hooks en `src/lib/hooks/use-library.ts`.
  - Validado en vivo contra `steam_hub.db`: página 200, filtros combinados, 400 con `param` en queries inválidas, sync 202 → DELETE → `cancelled` sin error.

- [x] **Tarea 5: Utilidades Extra (Ruleta Randomizer y Gestión de Estado)**
  - Implementar el modal "¿Qué jugamos hoy?" (`randomizer-modal.tsx`) con animación de ciclado de nombres sobre la lista filtrada actual, botones "Otra vez"/"Cerrar" y accesibilidad (Escape, backdrop, `role="dialog"`). El botón "Sugerir juego" en la barra superior abre el modal; la lógica pura vive en `src/lib/randomizer.ts` (`pickRandomGame`, `nextCyclingIndex`) y está testeada.
  - Permitir modificar manualmente el estado del juego (Backlog, En progreso, Completado, Abandonado) desde la tarjeta y la fila de tabla (`game-status-select.tsx`) vía `PATCH /api/games/[appid]`, con actualización optimista y rollback en `useLibraryGames.patchUserStatus`. Validación: `400` con `{error, param}` para `appid`/`userStatus`/JSON inválido, `404` si el juego no existe.
  - Filtros RF2.1/RF2.10 en `GET /api/games` y en el panel lateral: `userStatus` admite además los estados computados `notPlayed` (0 h) y `tested` (0 < jugado < 120 min); `minReview` filtra el porcentaje mínimo de reseñas positivas (los logros % no están disponibles en la API de Steam → limitación documentada).
  - Validado en vivo en `localhost:3311`: PATCH 200/400/404, filtros `userStatus`/`minReview` combinados (59 juegos `Backlog&minReview=95`, `tested` con 16 juegos reales), consultas combinadas ~6 ms (RNF3). 77 pruebas, typecheck, lint y build verdes.

- [x] **Tarea 6: Actualización de Especificaciones y Esquema (ProtonDB + Precios)**
  - Actualizar `requirements.md`, `architecture.md` y `tasks.md` con los nuevos requerimientos (RF1.3 flujo de amigos, RF2.4 extracción de jugadores, RF2.8 ProtonDB, RF2.9 precios, RF3.1 vista por defecto Tabla).
  - Esquema Drizzle/SQLite: eliminar `steam_deck_status`; añadir `proton_db_tier` (`NATIVE|PLATINUM|GOLD|SILVER|BRONZE|BORKED|UNKNOWN`) y campos de precios (`current_price`, `initial_price`, `discount_percent`, `lowest_price`, `lowest_discount_percent`, `lowest_price_date`).
  - Migración `drizzle/0001_protondb_prices.sql` (+ snapshot/journal) aplicada a `steam_hub.db` y al volumen Docker `./data/steam_hub.db`. `drizzle-kit generate` no funcionó sin TTY al renombrar columnas; la migración se escribió a mano al estilo Drizzle. El MCP de SQLite no está expuesto en la sesión → se usó `drizzle-orm` migrator + `sqlite3` CLI. La imagen Docker no incluía `0001` al construirse; se aplicó montando `./drizzle` sobre `/app/drizzle` en `docker compose run`.
  - Código alineado: query param `protonDbTier` (antes `deckStatus`), UI (badges, filtro, columna de tabla), `extractPlayerRange()` en `steam.ts` (rangos explícitos `N-M Players`/`N+ Players`; sin conteo y con multiplayer asume 1–4 o 2–4 según `Single-player`; solo single-player o sin MP → 1–1; tope UI 8), persistencia de precios desde `price_overview` (`final_formatted`/`initial`/`discount_percent`) en `persistStoreMetadata`. Backfill de `min/max_players` desde `categories` ya presentes en ambas BDs (61/146 multijugador en `steam_hub.db`).
  - Vista por defecto de la UI cambiada a **Tabla** (`page.tsx`).
  - Validación: 81/81 pruebas, typecheck, lint y build verdes; `scripts/validate-games-query.ts` sobre la BD real (consultas 0.5–10 ms; `protonDbTier=GOLD,NATIVE` → 0 porque los tiers siguen `UNKNOWN` hasta la Tarea 7; precios `null` hasta la próxima sincronización Store).

- [x] **Tarea 7: Enriquecimiento ProtonDB, CheapShark, amigos y jugadores**
  - `src/lib/proton.ts`: cliente ProtonDB (`summaries/{appid}.json`) con throttle, reintentos 429/5xx y 404→`null`; normaliza `tier` a `NATIVE|PLATINUM|GOLD|SILVER|BRONZE|BORKED|UNKNOWN`.
  - `src/lib/cheapshark.ts`: cliente CheapShark (búsqueda por `steamAppID` → `gameID` → detalles) con throttle; `priceHistory` con `lowestPrice`, `lowestDiscountPercent` y `lowestPriceDate`.
  - `src/lib/steam.ts`: `extractPlayerRange(categories, extraText)` analiza `short_description`; `parsePriceOverview` prefiere `final_formatted`/`initial_formatted`.
  - `src/lib/sync.ts`: fases `proton`/`cheapshark` en `SyncPhase`; stats `protonTiers`/`protonUnavailable`/`cheapsharkPrices`/`cheapsharkUnavailable`/`protonRequests`/`cheapsharkRequests`; settings `sync:protonChecked`/`sync:cheapsharkChecked`; `persistFriendGames` crea filas mínimas en `games` (FK `friend_games.appid → games.appid`); candidatos store/proton/cheapshark/hltb calculados tras el loop de amigos; `persistStoreMetadata` **no** sobrescribe `proton_db_tier` (la Store no aporta tiers; solo la fase proton lo escribe).
  - `src/lib/sync-deps.ts`: inyección `proton`/`cheapshark`; `src/lib/hooks/use-library.ts`: `SyncStatsShape` ampliada.
  - Tests: `proton.test.ts`, `cheapshark.test.ts`, `steam.test.ts` (descripción + precios formateados) y `sync.integration.test.ts` (tiers, CheapShark, amigo con juego ajeno, settings de comprobados). Sin reporte ProtonDB → `proton_db_tier='UNKNOWN'`.
  - **Verificación sync real** (`npx tsx scripts/verify-sync.ts` sobre `steam_hub.db`, `sqlite3` CLI porque el MCP de SQLite no está expuesto): 146 juegos; ProtonDB **142 tiers** (95 PLATINUM, 43 GOLD, 4 SILVER, 1 BRONZE, 3 UNKNOWN); precios actuales Store **126** (`current_price`/`initial_price`/`discount_percent` formateados); históricos CheapShark **29** (`lowest_price` + fecha); multijugador 61; **0 amigos** en la Web API de esta cuenta (perfil/lista no visible con la API key); `friends`/`friend_games` vacías. Correcciones durante la verificación: el Store ya no pisa tiers ProtonDB; 404/sin datos ProtonDB → `UNKNOWN` y se marca comprobado (evita re-query infinito); candidatos Store incluyen juegos sin `current_price` (free games sin `price_overview` siguen `null`).
  - Validación final: `npm test` (94/94), `npm run typecheck`, `npm run lint`, `npm run build` verdes.

- [x] **Tarea 8: UI — columna Linux, badges ProtonDB y modal de detalle (RF3.1/RF3.3)**
  - `src/components/game-badge.tsx` (nuevo): `ProtonDbBadge` y `ControllerBadge` compartidos; labels desde `PROTON_DB_TIER_OPTIONS`/`CONTROLLER_SUPPORT_OPTIONS`; colores `success` (NATIVE/PLATINUM), `warning` (GOLD), `muted` (SILVER/UNKNOWN), `danger` (BRONZE/BORKED).
  - `src/components/game-table.tsx`: columna `proton`/“ProtonDB” → **Linux** con badges; mando también con badge; prop `onRowClick` y filas clicables (`GameStatusSelect` mantiene `stopPropagation`).
  - `src/components/game-detail-modal.tsx` (nuevo): modal de detalle con precios (actual, descuento activo, mayor rebaja histórica con %, mínimo y fecha), amigos que lo poseen (avatar/nombre y estado vacío), metadatos extendidos (Linux, HLTB completo, multijugador, jugadores, mando, reseñas, tiempo jugado, estado, categorías). Cierre con Escape/backdrop/botón.
  - `src/components/game-card.tsx`: usa badges compartidos y `onOpen` (tarjeta clicable con teclado).
  - `src/app/page.tsx`: estado `detailGame`; `onRowClick`/`onOpen`; render de `GameDetailModal`; vista por defecto `table` confirmada.
  - Specs: `requirements.md` RF3.1 ampliada + RF3.3 nueva; `architecture.md` §5.
  - Validación: `npm test` (94/94), `npm run typecheck`, `npm run lint`, `npm run build` verdes.

