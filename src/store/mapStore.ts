import { create } from "zustand";
import * as db from "@/lib/db";
import type { CropKey, Game, ImageRec, Tile } from "@/lib/types";

let initStarted = false;

async function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

function findNearestFree(
  gx: number,
  gy: number,
  occupied: Set<string>,
): { gx: number; gy: number } {
  if (!occupied.has(`${gx},${gy}`)) return { gx, gy };
  for (let r = 1; r < 1000; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        if (!occupied.has(`${nx},${ny}`)) return { gx: nx, gy: ny };
      }
    }
  }
  return { gx, gy };
}

interface MapState {
  games: Game[];
  activeGameId: string | null;
  tiles: Tile[];
  images: Record<string, ImageRec>;
  urls: Record<string, string>;
  ready: boolean;

  init: () => Promise<void>;
  createGame: (name: string) => Promise<void>;
  renameGame: (id: string, name: string) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;
  selectGame: (id: string) => Promise<void>;
  setCrop: (id: string, crop: Partial<Record<CropKey, number>>) => Promise<void>;
  addImageAt: (blob: Blob, targetGx: number, targetGy: number, name?: string) => Promise<void>;
  moveTile: (tileId: string, gx: number, gy: number) => Promise<void>;
  deleteTile: (tileId: string) => Promise<void>;
}

export const useMapStore = create<MapState>((set, get) => ({
  games: [],
  activeGameId: null,
  tiles: [],
  images: {},
  urls: {},
  ready: false,

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    const games = await db.listGames();
    const lastId = await db.getMeta<string>("lastOpenedGameId");
    set({ games, ready: true });
    const toOpen =
      lastId && games.some((g) => g.id === lastId) ? lastId : (games[0]?.id ?? null);
    if (toOpen) await get().selectGame(toOpen);
  },

  createGame: async (name) => {
    const now = Date.now();
    const game: Game = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled",
      cellWidth: 0,
      cellHeight: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.putGame(game);
    set((s) => ({ games: [...s.games, game] }));
    await get().selectGame(game.id);
  },

  renameGame: async (id, name) => {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    const updated: Game = { ...game, name: name.trim() || game.name, updatedAt: Date.now() };
    await db.putGame(updated);
    set((s) => ({ games: s.games.map((g) => (g.id === id ? updated : g)) }));
  },

  setCrop: async (id, crop) => {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    const updated: Game = { ...game, ...crop, updatedAt: Date.now() };
    await db.putGame(updated);
    set((s) => ({ games: s.games.map((g) => (g.id === id ? updated : g)) }));
  },

  deleteGame: async (id) => {
    await db.deleteGameCascade(id);
    const wasActive = get().activeGameId === id;
    set((s) => ({ games: s.games.filter((g) => g.id !== id) }));
    if (wasActive) {
      for (const url of Object.values(get().urls)) URL.revokeObjectURL(url);
      set({ activeGameId: null, tiles: [], images: {}, urls: {} });
      const next = get().games[0]?.id ?? null;
      if (next) await get().selectGame(next);
      else await db.setMeta("lastOpenedGameId", undefined);
    }
  },

  selectGame: async (id) => {
    for (const url of Object.values(get().urls)) URL.revokeObjectURL(url);
    const [tiles, imageList] = await Promise.all([db.getTiles(id), db.getImages(id)]);
    const images: Record<string, ImageRec> = {};
    const urls: Record<string, string> = {};
    for (const img of imageList) {
      images[img.id] = img;
      urls[img.id] = URL.createObjectURL(img.blob);
    }
    set({ activeGameId: id, tiles, images, urls });
    await db.setMeta("lastOpenedGameId", id);
  },

  addImageAt: async (blob, targetGx, targetGy, name) => {
    const gameId = get().activeGameId;
    if (!gameId) return;
    const game = get().games.find((g) => g.id === gameId);
    if (!game) return;
    const { width, height } = await readImageSize(blob);

    let gx: number;
    let gy: number;
    let updatedGame: Game | null = null;
    if (game.cellWidth === 0 || game.cellHeight === 0) {
      updatedGame = { ...game, cellWidth: width, cellHeight: height, updatedAt: Date.now() };
      gx = 0;
      gy = 0;
    } else {
      const occupied = new Set(get().tiles.map((t) => `${t.gx},${t.gy}`));
      ({ gx, gy } = findNearestFree(targetGx, targetGy, occupied));
    }

    const image: ImageRec = {
      id: crypto.randomUUID(),
      gameId,
      blob,
      width,
      height,
      name: name ?? "image",
      createdAt: Date.now(),
    };
    const tile: Tile = { id: crypto.randomUUID(), gameId, imageId: image.id, gx, gy };
    await db.putImage(image);
    await db.putTile(tile);
    if (updatedGame) await db.putGame(updatedGame);

    const url = URL.createObjectURL(blob);
    const nextGame = updatedGame;
    set((s) => ({
      images: { ...s.images, [image.id]: image },
      urls: { ...s.urls, [image.id]: url },
      tiles: [...s.tiles, tile],
      games: nextGame ? s.games.map((g) => (g.id === gameId ? nextGame : g)) : s.games,
    }));
  },

  moveTile: async (tileId, gx, gy) => {
    const tile = get().tiles.find((t) => t.id === tileId);
    if (!tile) return;
    if (tile.gx === gx && tile.gy === gy) return;
    const occupied = new Set(
      get()
        .tiles.filter((t) => t.id !== tileId)
        .map((t) => `${t.gx},${t.gy}`),
    );
    if (occupied.has(`${gx},${gy}`)) return;
    const updated: Tile = { ...tile, gx, gy };
    await db.putTile(updated);
    set((s) => ({ tiles: s.tiles.map((t) => (t.id === tileId ? updated : t)) }));
  },

  deleteTile: async (tileId) => {
    const tile = get().tiles.find((t) => t.id === tileId);
    if (!tile) return;
    await db.deleteTile(tileId);
    await db.deleteImage(tile.imageId);
    const url = get().urls[tile.imageId];
    if (url) URL.revokeObjectURL(url);
    set((s) => {
      const urls = { ...s.urls };
      delete urls[tile.imageId];
      const images = { ...s.images };
      delete images[tile.imageId];
      return { tiles: s.tiles.filter((t) => t.id !== tileId), images, urls };
    });
  },
}));
