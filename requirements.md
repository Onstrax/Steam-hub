# Documento de Requerimientos: Steam Local Library Hub

## 1. Visión General
Una interfaz web local para visualizar, filtrar, ordenar y gestionar la biblioteca personal de Steam (~300+ juegos), integrando metadatos avanzados como duraciones de HowLongToBeat (HLTB), modos multijugador, compatibilidad de mandos, compatibilidad Linux/Proton (ProtonDB), información de precios y comparación de juegos compartidos con amigos.

## 2. Requerimientos Funcionales

### 2.1 Sincronización de Datos
- **RF1.1 (Botón de Sincronización Manual):** La UI debe contar con un botón "Sincronizar Biblioteca" que invoque la API de Steam y descargue/actualice la lista de juegos del usuario.
- **RF1.2 (Sincronización Incremental / Rate-Limit):** Los metadatos extendidos (Steam Store API y HLTB) se descargarán de forma progresiva respetando los límites de peticiones para evitar bloqueos IP.
- **RF1.3 (Lista de Amigos — flujo corregido):** La app sincronizará la lista de amigos del usuario y permitirá obtener la biblioteca de aquellos amigos con perfiles públicos. Flujo correcto:
  1. `ISteamUser/GetFriendList` para obtener la lista de amigos del usuario.
  2. Para cada amigo público (limitado por un tope configurable), `IPlayerService/GetOwnedGames` con su `steamid`.
  3. Persistir cada par `(steamid, appid)` en la tabla relacional `friend_games` (clave primaria compuesta), junto con la ficha del amigo en `friends`. Si el amigo posee un juego que **no** está en la biblioteca del usuario, se crea una fila mínima en `games` (FK de `friend_games`) para no perder la relación.
  4. La intersección de bibliotecas (RF2.6) se resuelve consultando `friend_games` con subconsultas correlacionadas `EXISTS`, una por amigo elegido.

### 2.2 Sistema de Filtros Avanzados
El usuario podrá combinar simultáneamente los siguientes filtros:
- **RF2.1 (Estado de Juego):** No jugado (0 hrs), Probado (<2 hrs), En progreso, Completado, Abandonado.
- **RF2.2 (Duración HLTB):** Filtro por rango de horas para completar la historia principal (ej. <5 hrs, 5-10 hrs, 10-20 hrs, 20+ hrs).
- **RF2.3 (Modos de Juego / Multijugador):** Un jugador, Co-op Local, Pantalla dividida (Split-Screen), Co-op Online, Multijugador competitivo.
- **RF2.4 (Rango de Jugadores):** Selector de cantidad mínima/máxima de jugadores (ej. 1 a 8 personas). `max_players` se extrae dinámicamente de las **categorías y la descripción corta** de la Steam Store API (ver `architecture.md` §3): patrones explícitos en descripciones/tags (p. ej. "2-8 Players", "4+ Players", "up to 8 players", "for 4 players") o, en su defecto, el techo documentado 4 cuando solo consta "Multi-player"/"Co-op" sin conteo explícito. Sin categorías multijugador el rango es 1–1.
- **RF2.5 (Soporte de Mando):** Total, Parcial, Sin soporte.
- **RF2.6 (Intersección con Amigos):** Seleccionar 1 o más amigos para mostrar únicamente los juegos que están en la biblioteca de todos los elegidos.
- **RF2.7 (Búsqueda y Etiquetas):** Búsqueda por texto en título y filtro multi-selección por géneros/etiquetas de Steam.
- **RF2.8 (Compatibilidad Linux/Proton — ProtonDB):** Filtro por tier de ProtonDB: `NATIVE`, `PLATINUM`, `GOLD`, `SILVER`, `BRONZE`, `BORKED`, `UNKNOWN`. Sustituye al antiguo estado de Steam Deck (`steam_deck_status`), que se elimina del esquema. La sincronización consulta la API pública de ProtonDB (`/api/v1/reports/summaries/{appid}.json`) y persiste el tier; sin reporte o con error se deja `UNKNOWN` y se marca como comprobado para no re-consultar en cada sync.
- **RF2.9 (Precios y Rebajas):** La biblioteca almacena metadatos de precio por juego: precio actual, precio inicial (sin descuento), % de descuento actual, precio histórico más bajo, mayor descuento histórico y fecha de ese mínimo. Los actuales/iniciales salen de `price_overview` de la Store API (`final_formatted`/`initial_formatted` cuando existen); el histórico (`lowest_*`) sale de CheapShark (`/api/1.0/games?steamAppID=` + detalles por `gameID`). Filtros y ordenación sobre estos campos pueden ampliarse en tareas futuras; el requisito mínimo es persistirlos y exponerlos en la API de lectura.
- **RF2.10 (Filtros Adicionales):** % Reseñas positivas y % Logros completados (este último no disponible en la API pública de Steam → limitación documentada).

### 2.3 Visualización y Utilidades
- **RF3.1 (Vistas):** Alternar entre Vista de Tabla detallada (con columnas ordenables por tiempo jugado, HLTB, nombre, etc.) y Vista de Cuadrícula (Posters/Carátulas). **La vista por defecto es Tabla.** La tabla incluye una columna **Linux** con el tier de ProtonDB como badge de color (verde para `NATIVE`/`PLATINUM`, dorado para `GOLD`, gris para `SILVER`, naranja/rojo para `BRONZE`/`BORKED`).
- **RF3.2 (Ruleta / Seleccionador Aleatorio):** Botón "Sugerir Juego" que elige aleatoriamente una opción de la lista filtrada actual.
- **RF3.3 (Detalle de Juego):** Al hacer clic en una fila de la tabla o en una tarjeta de la cuadrícula se abre un modal con el detalle del juego: precios (actual, descuento activo y mayor rebaja histórica con porcentaje, precio mínimo y fecha), amigos que lo poseen (avatar y nombre, o estado vacío), y metadatos extendidos (rating Linux/ProtonDB, HLTB historia/+extras/completionist, modos multijugador y soporte de mando). Se cierra con Escape, clic en el fondo o botón de cierre.

## 3. Requerimientos No Funcionales
- **RNF1 (Ejecución Local):** Debe funcionar 100% en localhost sin dependencias en la nube adicionales a las APIs externas.
- **RNF2 (Persistencia):** Toda la información debe almacenarse en una base de datos local SQLite (`steam_hub.db`).
- **RNF3 (Rendimiento):** La interfaz debe responder instantáneamente (<100ms) al aplicar o combinar filtros sobre los 300+ juegos indexados en la DB local.
