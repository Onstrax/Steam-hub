# Arquitectura Técnica: Steam Local Library Hub

## 1. Stack Tecnológico Elegido
- **Framework Fullstack:** Next.js 14+ (App Router, React 18, TypeScript).
- **Base de Datos:** SQLite usando `better-sqlite3` y `drizzle-orm`.
- **UI & Estilos:** Tailwind CSS, Shadcn UI (`radix-ui`), Lucide Icons, TanStack Table (para la vista en tabla).
- **Extracción de Datos:** `axios` para la Steam Web/Store API y cliente propio de HowLongToBeat (`src/lib/hltb.ts`) contra la API pública de `howlongtobeat.com` (`/api/search/site/init` → token `x-auth-token` → `/api/search/site`). El paquete npm `howlongtobeat` quedó fuera porque responde `403` desde que el sitio exige el token.

## 2. Esquema de Base de Datos (`steam_hub.db`)

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE games (
    appid INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    img_icon_url TEXT,
    playtime_forever INTEGER DEFAULT 0, -- en minutos
    user_status TEXT DEFAULT 'Backlog', -- Backlog, Playing, Completed, Abandoned

    -- Metadatos Store API
    is_free BOOLEAN DEFAULT 0,
    required_age INTEGER DEFAULT 0,
    short_description TEXT,
    header_image TEXT,
    controller_support TEXT, -- full, partial, none
    min_players INTEGER DEFAULT 1,
    max_players INTEGER DEFAULT 1,
    is_local_coop BOOLEAN DEFAULT 0,
    is_split_screen BOOLEAN DEFAULT 0,
    is_multiplayer BOOLEAN DEFAULT 0,
    proton_db_tier TEXT, -- NATIVE, PLATINUM, GOLD, SILVER, BRONZE, BORKED, UNKNOWN
    review_score INTEGER DEFAULT 0, -- Porcentaje de reseñas positivas (0-100)
    disk_space_gb REAL DEFAULT 0,   -- Tamaño estimado de instalación en GB

    -- Metadatos de precios (Store API `price_overview` + histórico)
    current_price TEXT,          -- precio actual formateado (p. ej. "9,99 US$")
    initial_price TEXT,          -- precio sin descuento formateado
    discount_percent INTEGER,    -- % de descuento actual (0 = sin descuento)
    lowest_price TEXT,           -- precio más bajo histórico formateado (reservado)
    lowest_discount_percent INTEGER, -- mayor descuento histórico (reservado)
    lowest_price_date TEXT,      -- fecha ISO del precio más bajo histórico (reservado)

    -- Metadatos HLTB
    hltb_main_story REAL DEFAULT 0, -- horas
    hltb_main_extra REAL DEFAULT 0,
    hltb_completionist REAL DEFAULT 0,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appid INTEGER,
    name TEXT,
    FOREIGN KEY(appid) REFERENCES games(appid)
);

CREATE TABLE friends (
    steamid TEXT PRIMARY KEY,
    personaname TEXT,
    avatarfull TEXT
);

CREATE TABLE friend_games (
    steamid TEXT,
    appid INTEGER,
    PRIMARY KEY(steamid, appid),
    FOREIGN KEY(steamid) REFERENCES friends(steamid),
    FOREIGN KEY(appid) REFERENCES games(appid)
);
```

### Notas de esquema
- **`proton_db_tier`** reemplaza al campo eliminado `steam_deck_status` (migración `0001`). Valores: `NATIVE | PLATINUM | GOLD | SILVER | BRONZE | BORKED | UNKNOWN`. La sincronización lo rellena **solo** desde ProtonDB; la Store API no lo escribe (así un re-sync de metadatos no pisa los tiers). Sin reporte queda `UNKNOWN`.
- **Precios:** `current_price`, `initial_price` y `discount_percent` se rellenan desde `price_overview` de la Store API (prefiriendo `final_formatted`/`initial_formatted`, con fallback a `final`/`initial`). `lowest_price`, `lowest_discount_percent` y `lowest_price_date` se rellenan desde CheapShark (`cheapestPriceEver` + mayor `savings` de `deals`).

## 3. Arquitectura de Sincronización y Control de Tráfico

1. **Paso 1 (Fast Sync):** Llama a `IPlayerService/GetOwnedGames/v0001` con la `API_KEY` y `SteamID64`. Actualiza la tabla `games` con `appid`, `name`, `playtime_forever` e `header_image`.
2. **Paso 2 (Metadatos Progresivos):** Para juegos sin metadatos de la Store API o sin `current_price`:
   * Consulta `https://store.steampowered.com/api/appdetails?appids={appid}` guardando una pausa de 1 segundo entre solicitudes para evitar error `429 Too Many Requests`.
   * Extrae categorías, banderas de modos, `controller_support`, reseñas (`appreviews`) y **precios** (`price_overview` → `current_price`, `initial_price`, `discount_percent`). Los juegos free sin `price_overview` quedan con precio `null`.
3. **Paso 2b (ProtonDB):** Para juegos con `proton_db_tier` en `NULL`/`UNKNOWN` y aún no comprobados (`sync:protonChecked`), consulta el resumen de ProtonDB con throttle y guarda el tier. 404 o sin tier válido → `UNKNOWN` y se marca como comprobado; errores de red no se marcan para reintentar en el próximo sync.
4. **Paso 2c (CheapShark):** Para juegos con `lowest_price` en `NULL` y no comprobados (`sync:cheapsharkChecked`): `GET /api/1.0/games?steamAppID={appid}` → `gameID` + `cheapest`; luego `GET /api/1.0/games?id={gameID}` → `cheapestPriceEver` y `deals[].savings`. Se persisten `lowest_price`, `lowest_discount_percent` y `lowest_price_date` (ISO `YYYY-MM-DD` desde el timestamp Unix). User-Agent descriptivo obligatorio.
5. **Paso 3 (Enriquecimiento HLTB):** Consulta el buscador de `howlongtobeat.com` (`GET /api/search/site/init?t=...` para el token y `POST /api/search/site` con el header `x-auth-token`), con throttle de 1.5 s entre búsquedas. Elige el resultado con mayor similitud de título (umbral 0.75) y guarda las duraciones estimadas en horas (`comp_main`, `comp_plus`, `comp_100` convertidos de segundos).

### 3.1 Amigos (flujo corregido, RF1.3)
1. `ISteamUser/GetFriendList/v0001` → upsert de cada amigo en `friends` (`steamid`, `personaname`, `avatarfull`).
2. Para cada amigo (hasta `maxFriendLibraries`, por defecto 50): `IPlayerService/GetOwnedGames/v0001` con su `steamid`. Si la biblioteca es privada o falla la llamada, se omite sin abortar la sincronización.
3. Antes de insertar en `friend_games`, se garantiza que cada `appid` exista en `games` (se crea una fila mínima con `name`/`img_icon_url`/`header_image` si el juego no está en la biblioteca del usuario). Esto evita que la FK `friend_games.appid → games.appid` descarte relaciones de amigos.
4. Cada `(steamid, appid)` se inserta en `friend_games` con `ON CONFLICT DO NOTHING` (sin duplicados; la clave primaria compuesta lo garantiza).
5. El filtro de intersección de amigos en `GET /api/games` itera `friend_ids` y exige un `EXISTS` correlacionado por amigo sobre `friend_games` (el juego debe ser propiedad de **todos** los amigos elegidos).

### 3.2 Extracción de `min_players` / `max_players` desde la Store API (RF2.4)
La Store API no expone un campo numérico de jugadores; se deriva de las **categorías/tags** y del **short_description** de `appdetails`:

1. Se buscan patrones explícitos en categorías y en el texto de la descripción:
   * Rango: `(\d+)\s*[-–]\s*(\d+)\s*players?` o `(\d+)\s*to\s*(\d+)\s*players?`.
   * Mínimo explícito: `(\d+)\+\s*players?`, `up to\s+(\d+)\s*players?`, `for\s+(\d+)\s*players?` o un conteo suelto `(\d+)\s*players?`.
2. Si el juego tiene categorías multijugador (`Multi-player`, `Co-op`, `Online Multi-Player`, `Shared/Split Screen`…) o indicios multijugador en la descripción, pero **sin** conteo explícito, se asume `max_players = 4` (techo documentado; el slider de la UI llega a 8) y `min_players = 2` salvo que también conste `Single-player` (entonces `min_players = 1`).
3. Si solo hay `Single-player` o no hay indicios relevantes: `min_players = 1`, `max_players = 1`.
4. El resultado se limita al rango de la UI: `max_players ∈ [1, 8]`.

Implementación: `extractPlayerRange(categories, extraText?)` en `src/lib/steam.ts`, aplicado en `mapStoreMetadata`/`persistStoreMetadata` (`src/lib/sync.ts`).

### 3.3 Integraciones externas de enriquecimiento
| Cliente | Fuente | Campos | Rate limit / errores |
| --- | --- | --- | --- |
| `src/lib/proton.ts` | `protondb.com/api/v1/reports/summaries/{appid}.json` | `proton_db_tier` | throttle 500 ms, reintentos 429/5xx, 404 → null |
| `src/lib/cheapshark.ts` | `cheapshark.com/api/1.0/games?steamAppID=` + `?id=` | `lowest_price`, `lowest_discount_percent`, `lowest_price_date` | throttle 400 ms, User-Agent descriptivo, 404 → null |
| `src/lib/hltb.ts` | `howlongtobeat.com` | `hltb_*` | throttle 1.5 s + token |

## 4. API de Lectura y Escritura: /api/games

### GET /api/games (lectura)

Ruta `src/app/api/games/route.ts` con la lógica de consulta en `src/lib/games-query.ts`. Devuelve `{ count, sortBy, sortOrder, games }`, donde cada juego incluye sus `categories` (categorías y géneros de la tabla `categories`) y los `friends` que lo poseen (unión de `friend_games` y `friends`), además de los campos de precio del esquema.

### Query params y semántica

| Parámetro | Semántica |
| --- | --- |
| `search` | `LIKE` case-insensitive sobre `name`, escapando `%`, `_` y `\`. |
| `minPlaytime` / `maxPlaytime` | Rango sobre `playtime_forever` (enteros ≥ 0). |
| `minHltb` / `maxHltb` | Rango sobre `hltb_main_story`; exige `hltb_main_story > 0` (los juegos sin datos HLTB se excluyen). `minHltb` es un extra para completar el rango RF2.2. |
| `isLocalCoop` / `isSplitScreen` | Booleanos (`true/1/yes/on` y `false/0/no/off`). |
| `controllerSupport` | Lista por coma: `full`, `partial`, `none` (case-insensitive). |
| `minPlayers` / `maxPlayers` | Intersección del rango soportado por el juego: `max_players >= minPlayers` y `min_players <= maxPlayers`. |
| `friendIds` | Lista de SteamID64; **intersección** (AND): el juego debe ser propiedad de *todos* los amigos elegidos (RF2.6). |
| `genres` | Lista de nombres; **unión** (OR) sobre la tabla `categories` (ahí se guardan tanto categorías como géneros). |
| `protonDbTier` | Lista: `NATIVE`, `PLATINUM`, `GOLD`, `SILVER`, `BRONZE`, `BORKED`, `UNKNOWN` (RF2.8). Sustituye al parámetro `deckStatus`. |
| `userStatus` | RF2.1/RF2.3: `Backlog`, `Playing`, `Completed`, `Abandoned` (case-insensitive), más los estados computados `notPlayed` (`playtime_forever = 0`) y `tested` (`0 < playtime_forever < 120` min). |
| `minReview` | RF2.10: entero ≥ 0; incluye juegos con `review_score >= minReview`. Los logros % no están disponibles en la API pública de Steam. |
| `sortBy` | `name`, `playtime`, `hltb`, `review`, `maxPlayers`, `updated`. Por defecto `name` (comparación `lower(name)`). |
| `sortOrder` | `asc` (por defecto) o `desc`; tiebreaker siempre `appid` ascendente. |

Parámetros inválidos (enums desconocidos, booleanos o números malformados) responden `400` con `{ error, param }`. Las consultas usan subconsultas correlacionadas (`EXISTS`) para géneros y amigos, evitando duplicados y sin `JOIN`s en la tabla principal.

Validación con datos reales (`scripts/validate-games-query.ts`): 146 juegos, consultas de 0.4–6.6 ms (RNF3 < 100 ms). Tras la sync real (Tarea 7): 142 tiers ProtonDB (95 PLATINUM / 43 GOLD / 4 SILVER / 1 BRONZE / 3 UNKNOWN), 126 precios actuales y 29 históricos CheapShark; `friends`/`friend_games` vacías porque la Web API de la cuenta no devuelve amigos visibles. `userStatus`/`minReview` se validaron en vivo (p. ej. `Backlog&minReview=95` → 59 juegos).

### PATCH /api/games/[appid] (gestión de estado, Tarea 5)

Ruta `src/app/api/games/[appid]/route.ts`: actualiza `games.user_status` con `{ userStatus }` en el cuerpo JSON. Respuestas: `200 { appid, userStatus }`; `400 { error, param }` para `appid` no entero, JSON inválido o `userStatus` fuera del conjunto (`Backlog|Playing|Completed|Abandoned`); `404 { error, param: "appid" }` si `changes === 0`; `500` en fallo de base de datos. El cliente (`useLibraryGames.patchUserStatus`) aplica el cambio de forma optimista y revierte mostrando el error si el servidor responde con fallo.

## 5. Interfaz de Usuario (Tareas 4–6)

Aplicación cliente en `src/app/page.tsx` (React "use client") que consume las rutas locales:

- **Barra superior:** título con recuento de resultados, `SegmentedControl` para alternar Tabla/Cuadrícula, botón **"Sugerir juego"** (RF3.2) que abre el randomizer y `SyncButton` (`src/components/sync-button.tsx`).
- **Vista por defecto: Tabla** (RF3.1); la cuadrícula es opcional.
- **Randomizer (Tarea 5):** `randomizer-modal.tsx` muestra "¿Qué jugamos hoy?" con animación de ciclado (~1.4 s) sobre los nombres de la lista filtrada y destaca la opción ganadora con carátula; botones "Otra vez"/"Cerrar", Escape y clic en el backdrop cierran; estado vacío indica que no hay juegos con los filtros activos. La lógica pura es `src/lib/randomizer.ts` (testeada con generador aleatorio inyectable).
- **Sincronización:** `POST /api/sync` → sondeo de `GET /api/sync` cada 800 ms → barra de progreso con mensaje/fase/porcentaje; `DELETE /api/sync` para cancelar; al terminar (completada/cancelada/fallida) se recargan juegos y metadatos. El cliente trata el `409` del POST adoptando la job en curso.
- **Panel de filtros** (`filters-sidebar.tsx`): búsqueda, sliders duales (horas jugadas en minutos en la API, HLTB en horas, jugadores 1–8), checkboxes Co-op local/Pantalla partida, selectores de mando, **ProtonDB** (`NATIVE`…`BORKED`/`UNKNOWN`), **estado del juego** (`LIBRARY_STATE_OPTIONS`: No jugado, Probado <2 h, En progreso, Completado, Abandonado) y **reseñas positivas mínimas** (slider 0–100 %), selector múltiple de amigos (intersección AND) y de géneros/etiquetas (OR), y orden (`sortBy`/`sortOrder`).
- **Cuadrícula:** `game-card.tsx` con carátula (`next/image`, patrones de `cdn.cloudflare.steamstatic.com` y avatares en `next.config.mjs`), badges de mando/ProtonDB/modos, avatares de amigos y **selector de estado** por tarjeta. La tarjeta es clicable (`onOpen`) y abre el modal de detalle.
- **Tabla (vista por defecto):** `game-table.tsx` con `@tanstack/react-table` v9 (`useTable`, `tableFeatures`, ordenamiento client-side por nombre, jugado, HLTB, mando, modos, jugadores, **Linux**, reseñas, estado y amigos) con columna "Estado" que edita vía `game-status-select.tsx`. La columna **Linux** pinta el tier de ProtonDB con `ProtonDbBadge` (badges de color según RF3.1); las filas son clicables (`onRowClick`) y abren el modal de detalle.
- **Badges compartidos:** `game-badge.tsx` expone `ProtonDbBadge`/`ControllerBadge` con los labels de `PROTON_DB_TIER_OPTIONS`/`CONTROLLER_SUPPORT_OPTIONS` y las variantes del design system (`success`/`warning`/`muted`/`danger`), reutilizados por tabla, cuadrícula y modal.
- **Detalle de juego (RF3.3):** `game-detail-modal.tsx` (custom, mismo patrón que el randomizer: `role="dialog"`, Escape, backdrop, cierre) muestra precios (actual, descuento activo, mayor rebaja histórica con %, mínimo y fecha), amigos que lo poseen con avatar/nombre y estado vacío, y metadatos extendidos (Linux/ProtonDB, HLTB historia/+extras/completionist, multijugador, rango de jugadores, mando, reseñas, tiempo jugado, estado y categorías). El estado `detailGame` vive en `page.tsx` y se pasa a tabla/cuadrícula.
- **Lógica separada de la UI (regla SDD 5):** `src/lib/filters-state.ts` (estado de filtros → `URLSearchParams`, conversión horas/minutos, opciones de estado/ProtonDB, formatters) y `src/lib/hooks/use-library.ts` (`useLibraryGames` con debounce, AbortController y `patchUserStatus`, `useLibraryMeta`, `useSyncController`).
- **Endpoints de metadatos:** `GET /api/friends` (amigos + conteo de `friend_games`) y `GET /api/genres` (nombres distintos de `categories`), usados por los selectores múltiples.

## 6. Estructura del Proyecto


```
steam-library-hub/
├── .opencode/
│   ├── rules/
│   │   └── sdd.md
│   └── opencode.json
├── docker-compose.yml
├── Dockerfile
├── docker-entrypoint.sh
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── sync/route.ts
│   │   │   ├── games/route.ts
│   │   │   ├── games/[appid]/route.ts
│   │   │   ├── friends/route.ts
│   │   │   └── genres/route.ts
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── filters-sidebar.tsx
│   │   ├── game-card.tsx
│   │   ├── game-status-select.tsx
│   │   ├── game-table.tsx
│   │   ├── randomizer-modal.tsx
│   │   └── sync-button.tsx
│   ├── lib/
│   │   ├── db/
│   │   ├── hooks/
│   │   │   └── use-library.ts
│   │   ├── steam.ts
│   │   ├── hltb.ts
│   │   ├── sync.ts
│   │   ├── sync-deps.ts
│   │   ├── games-query.ts
│   │   ├── filters-state.ts
│   │   ├── randomizer.ts
│   │   └── utils.ts
│   └── types/
├── drizzle/
│   ├── 0000_tan_revanche.sql
│   └── 0001_protondb_prices.sql
├── scripts/
│   ├── docker-migrate.js
│   └── validate-games-query.ts
├── tests/
│   ├── games-patch.test.ts
│   ├── games-query.test.ts
│   ├── randomizer.test.ts
│   ├── filters-state.test.ts
│   ├── library-meta.test.ts
│   ├── sync.integration.test.ts
│   ├── steam.test.ts
│   └── hltb.test.ts
├── steam_hub.db
├── requirements.md
├── architecture.md
└── tasks.md
```
