import { create } from "zustand";
import * as db from "@/lib/db";
import { importGameZip } from "@/lib/backup";
import type { CropKey, Game, ImageRec, MarkerIcon, RoomMarker, Tile } from "@/lib/types";

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
  markers: RoomMarker[];
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
  setTileNote: (tileId: string, note: string) => Promise<void>;
  addEmptyTile: (gx: number, gy: number) => Promise<string | null>;
  addMarker: (data: {
    tileId: string;
    u: number;
    v: number;
    label: string;
    icon: MarkerIcon;
    color: string;
    note?: string;
  }) => Promise<string | null>;
  updateMarker: (
    id: string,
    patch: Partial<Pick<RoomMarker, "label" | "icon" | "color" | "note">>,
  ) => Promise<void>;
  moveMarker: (id: string, tileId: string, u: number, v: number) => Promise<void>;
  deleteMarker: (id: string) => Promise<void>;
  importBackup: (file: File) => Promise<void>;
}

export const useMapStore = create<MapState>((set, get) => ({
  games: [],
  activeGameId: null,
  tiles: [],
  markers: [],
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
      set({ activeGameId: null, tiles: [], markers: [], images: {}, urls: {} });
      const next = get().games[0]?.id ?? null;
      if (next) await get().selectGame(next);
      else await db.setMeta("lastOpenedGameId", undefined);
    }
  },

  selectGame: async (id) => {
    for (const url of Object.values(get().urls)) URL.revokeObjectURL(url);
    const [tiles, imageList, markers] = await Promise.all([
      db.getTiles(id),
      db.getImages(id),
      db.getMarkers(id),
    ]);
    const images: Record<string, ImageRec> = {};
    const urls: Record<string, string> = {};
    for (const img of imageList) {
      images[img.id] = img;
      urls[img.id] = URL.createObjectURL(img.blob);
    }
    set({ activeGameId: id, tiles, markers, images, urls });
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
    await db.deleteMarkersForTile(tileId);
    await db.deleteZoneLinksForTile(tileId);
    if (tile.imageId) {
      await db.deleteImage(tile.imageId);
      const url = get().urls[tile.imageId];
      if (url) URL.revokeObjectURL(url);
    }
    set((s) => {
      const urls = { ...s.urls };
      const images = { ...s.images };
      if (tile.imageId) {
        delete urls[tile.imageId];
        delete images[tile.imageId];
      }
      return {
        tiles: s.tiles.filter((t) => t.id !== tileId),
        markers: s.markers.filter((m) => m.tileId !== tileId),
        images,
        urls,
      };
    });
  },

  setTileNote: async (tileId, note) => {
    const tile = get().tiles.find((t) => t.id === tileId);
    if (!tile) return;
    const trimmed = note.trim();
    const updated: Tile = { ...tile, note: trimmed || undefined };
    await db.putTile(updated);
    set((s) => ({ tiles: s.tiles.map((t) => (t.id === tileId ? updated : t)) }));
  },

  addEmptyTile: async (gx, gy) => {
    const gameId = get().activeGameId;
    if (!gameId) return null;
    const game = get().games.find((g) => g.id === gameId);
    if (!game || game.cellWidth === 0) return null;
    if (get().tiles.some((t) => t.gx === gx && t.gy === gy)) return null;
    const tile: Tile = { id: crypto.randomUUID(), gameId, gx, gy };
    await db.putTile(tile);
    set((s) => ({ tiles: [...s.tiles, tile] }));
    return tile.id;
  },

  addMarker: async (data) => {
    const gameId = get().activeGameId;
    if (!gameId) return null;
    if (!get().tiles.some((t) => t.id === data.tileId)) return null;
    const marker: RoomMarker = {
      id: crypto.randomUUID(),
      gameId,
      tileId: data.tileId,
      u: Math.min(1, Math.max(0, data.u)),
      v: Math.min(1, Math.max(0, data.v)),
      label: data.label,
      icon: data.icon,
      color: data.color,
      note: data.note,
      createdAt: Date.now(),
    };
    await db.putMarker(marker);
    set((s) => ({ markers: [...s.markers, marker] }));
    return marker.id;
  },

  updateMarker: async (id, patch) => {
    const marker = get().markers.find((m) => m.id === id);
    if (!marker) return;
    const updated: RoomMarker = { ...marker, ...patch };
    await db.putMarker(updated);
    set((s) => ({ markers: s.markers.map((m) => (m.id === id ? updated : m)) }));
  },

  moveMarker: async (id, tileId, u, v) => {
    const marker = get().markers.find((m) => m.id === id);
    if (!marker) return;
    if (!get().tiles.some((t) => t.id === tileId)) return;
    const updated: RoomMarker = {
      ...marker,
      tileId,
      u: Math.min(1, Math.max(0, u)),
      v: Math.min(1, Math.max(0, v)),
    };
    await db.putMarker(updated);
    set((s) => ({ markers: s.markers.map((m) => (m.id === id ? updated : m)) }));
  },

  deleteMarker: async (id) => {
    await db.deleteMarker(id);
    set((s) => ({ markers: s.markers.filter((m) => m.id !== id) }));
  },

  importBackup: async (file) => {
    const newGameId = await importGameZip(file);
    const game = await db.getGame(newGameId);
    if (!game) return;
    set((s) => ({ games: [...s.games, game] }));
    await get().selectGame(newGameId);
  },
}));
