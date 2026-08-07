import { strFromU8, strToU8, unzip, zip } from "fflate";
import type { Zippable } from "fflate";
import * as db from "@/lib/db";
import type { Game } from "@/lib/types";

interface ManifestImage {
  id: string;
  name: string;
  width: number;
  height: number;
  type: string;
  file: string;
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
  tiles: { imageId: string; gx: number; gy: number }[];
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
  const [tiles, images] = await Promise.all([db.getTiles(gameId), db.getImages(gameId)]);

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
    tiles: tiles.map((t) => ({ imageId: t.imageId, gx: t.gx, gy: t.gy })),
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
  if (manifest.version !== 1 || !manifest.game) {
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

  for (const tile of manifest.tiles) {
    const imageId = idMap.get(tile.imageId);
    if (!imageId) continue;
    await db.putTile({ id: crypto.randomUUID(), gameId, imageId, gx: tile.gx, gy: tile.gy });
  }

  return gameId;
}
