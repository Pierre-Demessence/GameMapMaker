import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { Game, ImageRec, Tile } from "./types";

interface MapDB extends DBSchema {
  games: { key: string; value: Game };
  images: { key: string; value: ImageRec; indexes: { "by-game": string } };
  tiles: { key: string; value: Tile; indexes: { "by-game": string } };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<MapDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MapDB>> {
  const promise = (dbPromise ??= openDB<MapDB>("game-map-maker", 1, {
    upgrade(database) {
      database.createObjectStore("games", { keyPath: "id" });
      const images = database.createObjectStore("images", { keyPath: "id" });
      images.createIndex("by-game", "gameId");
      const tiles = database.createObjectStore("tiles", { keyPath: "id" });
      tiles.createIndex("by-game", "gameId");
      database.createObjectStore("meta");
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
  const tx = database.transaction(["games", "images", "tiles"], "readwrite");
  await tx.objectStore("games").delete(gameId);
  for (const name of ["images", "tiles"] as const) {
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

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await getDB()).get("meta", key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const database = await getDB();
  if (value === undefined) await database.delete("meta", key);
  else await database.put("meta", value, key);
}
