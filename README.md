# Steam Local Library Hub

Interfaz web **local** para visualizar, filtrar, ordenar y gestionar tu biblioteca personal de Steam. Consulta las APIs de Steam (Web API + Store API) y HowLongToBeat, guarda todo en SQLite y funciona 100 % en tu máquina (sin dependencias en la nube más allá de esas APIs externas).

## Qué puede hacer

### Sincronización de datos
- Botón **Sincronizar Biblioteca** que descarga tus juegos vía `IPlayerService/GetOwnedGames`.
- Enriquecimiento progresivo de metadatos (Store API: categorías, co-op local, pantalla partida, soporte de mando, jugadores, % de reseñas, compatibilidad ProtonDB, precios) respetando rate limits (~1 req/s).
- Duraciones de **HowLongToBeat** (historia principal / +extras / 100 %) con throttle de 1.5 s.
- Lista de **amigos** y bibliotecas de aquellos con perfil público (intersección de juegos compartidos).
- Progreso en vivo (fase, porcentaje, estadísticas) con opción de **cancelar** a mitad de la sincronización.

### Filtros combinables
| Filtro | Detalle |
| --- | --- |
| Estado del juego | No jugado (0 h), Probado (<2 h), En progreso, Completado, Abandonado |
| Tiempo jugado | Rango en horas (API en minutos) |
| Duración HLTB | Rango sobre la historia principal (los juegos sin datos se excluyen) |
| Modos de juego | Un jugador, Co-op local, Pantalla partida |
| Rango de jugadores | 1 a 8 jugadores (intersección del rango soportado) |
| Soporte de mando | Total / Parcial / Sin soporte |
| Amigos | Intersección (AND): juegos que poseen **todos** los amigos elegidos |
| Búsqueda y etiquetas | Texto en el título + selección múltiple de categorías/géneros (OR) |
| ProtonDB | Nativo / Platino / Oro / Plata / Bronce / Roto / Sin datos |
| Reseñas positivas | Porcentaje mínimo de reseñas de la Store API |

### Visualización y utilidades
- Vistas **Tabla** (por defecto; columnas ordenables por nombre, jugado, HLTB, mando, modos, jugadores, Linux, reseñas, estado y amigos) y **Cuadrícula** (carátulas).
- **Detalle del juego**: clic en una fila o tarjeta abre un modal con precios, amigos que lo poseen, metadatos extendidos (Linux/ProtonDB, HLTB, multijugador, reseñas, mando) y categorías.
- **Ruleta "¿Qué jugamos hoy?"**: botón *Sugerir juego* que sortea sobre la lista filtrada con animación.
- **Gestión de estado manual** desde la tarjeta o la fila de la tabla (se guarda en la base de datos local).
- **Precios**: la sincronización guarda el precio actual, el precio inicial y el % de descuento desde la Store API, y el histórico desde CheapShark (precio mínimo, mayor descuento y fecha).

### API HTTP
| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/games` | Lista filtrada/ordenada (`search`, `minPlaytime`, `maxPlaytime`, `minHltb`, `maxHltb`, `isLocalCoop`, `isSplitScreen`, `controllerSupport`, `minPlayers`, `maxPlayers`, `friendIds`, `genres`, `protonDbTier`, `userStatus`, `minReview`, `sortBy`, `sortOrder`) |
| `PATCH` | `/api/games/[appid]` | Actualiza `userStatus` de un juego |
| `GET` | `/api/friends` | Amigos con conteo de juegos |
| `GET` | `/api/genres` | Categorías/géneros distintos |
| `POST` / `GET` / `DELETE` | `/api/sync` | Iniciar / consultar progreso / cancelar sincronización |

Consultas combinadas responden en milisegundos sobre cientos de juegos (objetivo <100 ms).

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** (tema Steam)
- **Drizzle ORM** + **better-sqlite3** (SQLite local)
- **@tanstack/react-table** para la vista de tabla
- Sincronización con la Web API/Store API de Steam y HowLongToBeat

## Requisitos

- **Docker + Docker Compose** (recomendado), o Node.js 20+ para la instalación manual
- Una **API key de Steam** y tu **SteamID64**:
  1. API key: <https://steamcommunity.com/dev/apikey>
  2. SteamID64: visible en tu perfil (`https://steamcommunity.com/profiles/<STEAMID64>`)

## Inicio rápido con Docker (recomendado)

```bash
# 1. Configura tus credenciales
cp .env.example .env
# Edita .env y rellena STEAM_API_KEY y STEAM_ID

# 2. Levanta la aplicación
docker compose up --build -d

# 3. Abre la interfaz
# → http://localhost:3311  (o el HOST_PORT que fijes en .env)
```

La base de datos se guarda en `./data/steam_hub.db` (volumen montado en `/data`), así que **sobrevive** a `docker compose down`.

```bash
# Ver logs
docker compose logs -f steam-hub

# Detener (los datos se conservan en ./data)
docker compose down

# Detener y borrar también la base de datos local
docker compose down -v && rm -rf ./data

# Reconstruir tras cambiar código
docker compose up --build -d
```

> En la primera ejecución la BD está vacía: pulsa **Sincronizar Biblioteca** en la interfaz para descargar tus juegos. La primera sincronización puede tardar varios minutos (rate limiting de Steam y HLTB).

### Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `STEAM_API_KEY` | Sí (para sincronizar) | Clave de la Web API de Steam |
| `STEAM_ID` | Sí (para sincronizar) | Tu SteamID64 |
| `HOST_PORT` | No (def. `3311`) | Puerto del host en Docker Compose |
| `DATABASE_PATH` | No | Ruta de la BD (Docker: `/data/steam_hub.db`) |

El contenedor acepta credenciales desde `.env` o `.env.local` (si existen) mediante `env_file` del Compose.

## Instalación manual (sin Docker)

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env.local
# Edita .env.local con STEAM_API_KEY y STEAM_ID

# 3. Desarrollo
npm run dev
# → http://localhost:3000

# 4. Producción
npm run build
npm start
```

La BD se crea automáticamente en la raíz del proyecto (`steam_hub.db`) al primer arranque; las migraciones de Drizzle se aplican con:

```bash
npm run db:migrate
```

## Guía de uso

1. **Sincronizar** — Pulsa *Sincronizar Biblioteca* en la cabecera. Verás el progreso (fase, barra, estadísticas). Puedes cancelar con *Cancelar*; la app se recarga sola al terminar.
2. **Filtrar** — Usa el panel lateral: combina búsqueda, horas, HLTB, co-op, jugadores, mando, ProtonDB/Linux, estado, reseñas, amigos y etiquetas. El contador de la cabecera muestra los resultados y los filtros activos.
3. **Ordenar** — En la vista de tabla, haz clic en las cabeceras de columna. En el panel lateral también puedes elegir el criterio (nombre, tiempo jugado, HLTB, reseñas, jugadores máx., actualización) y el orden.
4. **Cambiar vista** — Alterna entre *Cuadrícula* (carátulas) y *Tabla* (detalle ordenable).
5. **Gestionar estado** — En cada tarjeta/fila, selecciona *Backlog / En progreso / Completado / Abandonado*. Se guarda al instante en la base de datos local (y puedes filtrar por esos estados).
6. **Sugerir juego** — Pulsa *Sugerir juego*: la ruleta cicla los nombres de la lista filtrada y destaca uno al azar. *Otra vez* repite el sorteo; *Cerrar* o `Esc` cierran el modal.

### Límites conocidos

- **Logros %** no están disponibles en la API pública de Steam; el filtro de reseñas usa el % de reseñas de la Store API.
- **Amigos privados**: solo se pueden consultar bibliotecas con visibilidad pública.
- **ProtonDB**: la compatibilidad en Linux se obtiene del resumen público de [protondb.com](https://www.protondb.com); los juegos sin reportes aparecen como *Sin datos* (`UNKNOWN`). La Store API de Steam no publica este dato.
- La **primera sincronización** es lenta a propósito (rate limiting); las siguientes son incrementales.
- La app es **local**: no hay usuarios ni autenticación. No expongas el puerto a Internet sin proxy/VPN.

## Comandos de desarrollo

```bash
npm run dev        # servidor de desarrollo
npm run build      # build de producción
npm start          # servir el build
npm run lint       # ESLint
npm run typecheck  # comprobación de tipos (tsc --noEmit)
npm test           # suite de pruebas (node:test + tsx)
npm run db:studio  # Drizzle Studio (inspeccionar la BD)
```

## Estructura del proyecto

```
steam-library-hub/
├── docker-compose.yml        # Levantado local con Docker
├── Dockerfile                # Imagen multi-stage de producción
├── docker-entrypoint.sh      # Migraciones + arranque
├── drizzle/                  # Migraciones SQL de Drizzle
├── scripts/
│   ├── docker-migrate.js    # Migrador usado por el contenedor
│   └── verify-sync.ts       # Sincronización + verificación contra datos reales
├── src/
│   ├── app/
│   │   ├── api/              # /api/games, /api/games/[appid], /api/sync, /api/friends, /api/genres
│   │   ├── page.tsx          # Vista principal (cliente)
│   │   └── layout.tsx
│   ├── components/           # UI: filtros, tarjetas, tabla, ruleta, sync
│   └── lib/
│       ├── db/               # Conexión SQLite + schema Drizzle
│       ├── hooks/            # useLibraryGames / useLibraryMeta / useSyncController
│       ├── steam.ts          # Cliente Web API + Store API (rate limit, reintentos)
│       ├── hltb.ts           # Cliente HowLongToBeat
│       ├── sync.ts           # Motor de sincronización asíncrona
│       ├── games-query.ts    # Parseo y consulta filtrada (SQL)
│       ├── filters-state.ts  # Estado de filtros client-side
│       └── randomizer.ts     # Lógica de la ruleta
├── tests/                    # Pruebas de nodos: sync, games-query, filtros, PATCH, etc.
├── requirements.md
├── architecture.md
└── tasks.md
```

## Solución de problemas

| Problema | Solución |
| --- | --- |
| `STEAM_ID no está definido` al sincronizar | Revisa `.env` / `.env.local` y que el contenedor las esté leyendo (`docker compose config`) |
| Puerto ocupado en `docker compose up` | Cambia `HOST_PORT` en `.env` (p. ej. `8080:3000`) |
| La BD de Docker está vacía tras levantar | Es correcto en un volumen nuevo: pulsa *Sincronizar Biblioteca*. Copia tu `steam_hub.db` previo a `./data/` si quieres reutilizarla |
| Sincronización muy lenta | Es el rate limiting de Steam/HLTB; se puede cancelar y reanudar después |
| Amigos no aparecen en el filtro | Solo se importan bibliotecas con perfil público de Steam |
| Error `429` de Steam | La app ya reintenta con backoff; espera y reintenta la sincronización |

## Licencia

Distribuido bajo la licencia **MIT**. Consulta el archivo [`LICENSE`](./LICENSE).
