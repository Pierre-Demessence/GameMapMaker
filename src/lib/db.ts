import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { Game, ImageRec, RoomMarker, Tile, ZoneLink } from "./types";

interface MapDB extends DBSchema {
  games: { key: string; value: Game };
  images: { key: string; value: ImageRec; indexes: { "by-game": string } };
  tiles: { key: string; value: Tile; indexes: { "by-game": string } };
  markers: { key: string; value: RoomMarker; indexes: { "by-game": string } };
  zoneLinks: { key: string; value: ZoneLink; indexes: { "by-game": string } };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<MapDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MapDB>> {
  const promise = (dbPromise ??= openDB<MapDB>("game-map-maker", 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("games", { keyPath: "id" });
        const images = database.createObjectStore("images", { keyPath: "id" });
        images.createIndex("by-game", "gameId");
        const tiles = database.createObjectStore("tiles", { keyPath: "id" });
        tiles.createIndex("by-game", "gameId");
        database.createObjectStore("meta");
      }
      if (oldVersion < 2) {
        const markers = database.createObjectStore("markers", { keyPath: "id" });
        markers.createIndex("by-game", "gameId");
        const zoneLinks = database.createObjectStore("zoneLinks", { keyPath: "id" });
        zoneLinks.createIndex("by-game", "gameId");
      }
    },
  }));
  return promise;
}

export async function listGames(): Promise<Game[]> {
  return (await getDB()).getAll("games");
}

export async function getGame(id: string): Promise<Game | undefined> {
  return (await getDB()).get("games", id);
}

export async function putGame(game: Game): Promise<void> {
  await (await getDB()).put("games", game);
}

export async function deleteGameCascade(gameId: string): Promise<void> {
  const database = await getDB();
  const tx = database.transaction(["games", "images", "tiles", "markers", "zoneLinks"], "readwrite");
  await tx.objectStore("games").delete(gameId);
  for (const name of ["images", "tiles", "markers", "zoneLinks"] as const) {
    const index = tx.objectStore(name).index("by-game");
    let cursor = await index.openCursor(gameId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function getImages(gameId: string): Promise<ImageRec[]> {
  return (await getDB()).getAllFromIndex("images", "by-game", gameId);
}

export async function putImage(image: ImageRec): Promise<void> {
  await (await getDB()).put("images", image);
}

export async function deleteImage(id: string): Promise<void> {
  await (await getDB()).delete("images", id);
}

export async function getTiles(gameId: string): Promise<Tile[]> {
  return (await getDB()).getAllFromIndex("tiles", "by-game", gameId);
}

export async function putTile(tile: Tile): Promise<void> {
  await (await getDB()).put("tiles", tile);
}

export async function deleteTile(id: string): Promise<void> {
  await (await getDB()).delete("tiles", id);
}

export async function getMarkers(gameId: string): Promise<RoomMarker[]> {
  return (await getDB()).getAllFromIndex("markers", "by-game", gameId);
}

export async function putMarker(marker: RoomMarker): Promise<void> {
  await (await getDB()).put("markers", marker);
}

export async function deleteMarker(id: string): Promise<void> {
  await (await getDB()).delete("markers", id);
}

export async function deleteMarkersForTile(tileId: string): Promise<void> {
  const database = await getDB();
  const tx = database.transaction("markers", "readwrite");
  let cursor = await tx.objectStore("markers").openCursor();
  while (cursor) {
    if (cursor.value.tileId === tileId) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteZoneLinksForTile(tileId: string): Promise<void> {
  const database = await getDB();
  const tx = database.transaction("zoneLinks", "readwrite");
  let cursor = await tx.objectStore("zoneLinks").openCursor();
  while (cursor) {
    const link = cursor.value;
    if (link.fromTileId === tileId || link.toTileId === tileId) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getZoneLinks(gameId: string): Promise<ZoneLink[]> {
  return (await getDB()).getAllFromIndex("zoneLinks", "by-game", gameId);
}

export async function putZoneLink(link: ZoneLink): Promise<void> {
  await (await getDB()).put("zoneLinks", link);
}

export async function deleteZoneLink(id: string): Promise<void> {
  await (await getDB()).delete("zoneLinks", id);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await getDB()).get("meta", key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const database = await getDB();
  if (value === undefined) await database.delete("meta", key);
  else await database.put("meta", value, key);
}
