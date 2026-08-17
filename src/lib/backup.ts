import { strFromU8, strToU8, unzip, zip } from "fflate";
import type { Zippable } from "fflate";
import * as db from "@/lib/db";
import type { Game, MarkerIcon, RoomMarker } from "@/lib/types";

interface ManifestImage {
  id: string;
  name: string;
  width: number;
  height: number;
  type: string;
  file: string;
}

interface ManifestTile {
  id?: string;
  imageId?: string;
  gx: number;
  gy: number;
  note?: string;
}

interface ManifestMarker {
  tileId: string;
  u: number;
  v: number;
  label: string;
  icon: string;
  color: string;
  note?: string;
}

interface Manifest {
  version: 1;
  game: {
    name: string;
    cellWidth: number;
    cellHeight: number;
    cropTop?: number;
    cropRight?: number;
    cropBottom?: number;
    cropLeft?: number;
  };
  images: ManifestImage[];
  tiles: ManifestTile[];
  markers?: ManifestMarker[];
}

function extForType(type: string): string {
  switch (type) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".bin";
  }
}

function sanitizeFilename(name: string): string {
  return (name.trim() || "map").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

function zipAsync(files: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

export async function exportGameZip(
  gameId: string,
): Promise<{ blob: Blob; filename: string } | null> {
  const game = await db.getGame(gameId);
  if (!game) return null;
  const [tiles, images, markers] = await Promise.all([
    db.getTiles(gameId),
    db.getImages(gameId),
    db.getMarkers(gameId),
  ]);

  const files: Zippable = {};
  const manifestImages: ManifestImage[] = [];
  for (const image of images) {
    const file = `images/${image.id}${extForType(image.blob.type)}`;
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    files[file] = [bytes, { level: 0 }];
    manifestImages.push({
      id: image.id,
      name: image.name,
      width: image.width,
      height: image.height,
      type: image.blob.type || "image/png",
      file,
    });
  }

  const manifest: Manifest = {
    version: 1,
    game: {
      name: game.name,
      cellWidth: game.cellWidth,
      cellHeight: game.cellHeight,
      cropTop: game.cropTop,
      cropRight: game.cropRight,
      cropBottom: game.cropBottom,
      cropLeft: game.cropLeft,
    },
    images: manifestImages,
    tiles: tiles.map((t) => ({ id: t.id, imageId: t.imageId, gx: t.gx, gy: t.gy, note: t.note })),
    markers: markers.map((m) => ({
      tileId: m.tileId,
      u: m.u,
      v: m.v,
      label: m.label,
      icon: m.icon,
      color: m.color,
      note: m.note,
    })),
  };
  files["manifest.json"] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];

  const zipped = await zipAsync(files);
  const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
  return { blob, filename: `${sanitizeFilename(game.name)}.gmm.zip` };
}

export async function importGameZip(file: File): Promise<string> {
  const entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new Error("Not a valid backup: manifest.json is missing.");

  const manifest = JSON.parse(strFromU8(manifestBytes)) as Manifest;
  if (
    manifest.version !== 1 ||
    !manifest.game ||
    typeof manifest.game.cellWidth !== "number" ||
    typeof manifest.game.cellHeight !== "number" ||
    !Array.isArray(manifest.images) ||
    !Array.isArray(manifest.tiles) ||
    (manifest.markers !== undefined && !Array.isArray(manifest.markers))
  ) {
    throw new Error("Unsupported or corrupted backup file.");
  }

  const now = Date.now();
  const gameId = crypto.randomUUID();
  const game: Game = {
    id: gameId,
    name: manifest.game.name || "Imported map",
    cellWidth: manifest.game.cellWidth,
    cellHeight: manifest.game.cellHeight,
    cropTop: manifest.game.cropTop,
    cropRight: manifest.game.cropRight,
    cropBottom: manifest.game.cropBottom,
    cropLeft: manifest.game.cropLeft,
    createdAt: now,
    updatedAt: now,
  };
  await db.putGame(game);

  const idMap = new Map<string, string>();
  for (const image of manifest.images) {
    const bytes = entries[image.file];
    if (!bytes) continue;
    const newId = crypto.randomUUID();
    idMap.set(image.id, newId);
    await db.putImage({
      id: newId,
      gameId,
      blob: new Blob([new Uint8Array(bytes)], { type: image.type || "image/png" }),
      width: image.width,
      height: image.height,
      name: image.name,
      createdAt: now,
    });
  }

  if (manifest.images.length > 0 && idMap.size === 0) {
    await db.deleteGameCascade(gameId);
    throw new Error("Backup is missing its image data.");
  }

  const tileIdMap = new Map<string, string>();
  for (const tile of manifest.tiles) {
    let imageId: string | undefined;
    if (tile.imageId) {
      imageId = idMap.get(tile.imageId);
      if (!imageId) continue;
    }
    const newTileId = crypto.randomUUID();
    if (tile.id) tileIdMap.set(tile.id, newTileId);
    await db.putTile({
      id: newTileId,
      gameId,
      imageId,
      gx: tile.gx,
      gy: tile.gy,
      note: tile.note,
    });
  }

  const MARKER_ICONS: MarkerIcon[] = ["pin", "star", "flag", "gem", "skull"];
  for (const marker of manifest.markers ?? []) {
    const tileId = tileIdMap.get(marker.tileId);
    if (!tileId) continue;
    const roomMarker: RoomMarker = {
      id: crypto.randomUUID(),
      gameId,
      tileId,
      u: Math.min(1, Math.max(0, typeof marker.u === "number" ? marker.u : 0.5)),
      v: Math.min(1, Math.max(0, typeof marker.v === "number" ? marker.v : 0.5)),
      label: typeof marker.label === "string" ? marker.label : "Marker",
      icon: MARKER_ICONS.includes(marker.icon as MarkerIcon) ? (marker.icon as MarkerIcon) : "pin",
      color: typeof marker.color === "string" ? marker.color : "#f59e0b",
      note: marker.note,
      createdAt: now,
    };
    await db.putMarker(roomMarker);
  }

  return gameId;
}
