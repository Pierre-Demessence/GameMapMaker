import * as db from "@/lib/db";

function sanitizeFilename(name: string): string {
  return (name.trim() || "map").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

export async function exportGameImage(
  gameId: string,
): Promise<{ blob: Blob; filename: string } | null> {
  const game = await db.getGame(gameId);
  if (!game || game.cellWidth === 0) return null;
  const [tiles, images] = await Promise.all([db.getTiles(gameId), db.getImages(gameId)]);
  if (tiles.length === 0) return null;

  const cropL = game.cropLeft ?? 0;
  const cropT = game.cropTop ?? 0;
  const cropR = game.cropRight ?? 0;
  const cropB = game.cropBottom ?? 0;
  const effW = Math.max(1, game.cellWidth - cropL - cropR);
  const effH = Math.max(1, game.cellHeight - cropT - cropB);

  let minGx = Infinity;
  let minGy = Infinity;
  let maxGx = -Infinity;
  let maxGy = -Infinity;
  for (const t of tiles) {
    minGx = Math.min(minGx, t.gx);
    minGy = Math.min(minGy, t.gy);
    maxGx = Math.max(maxGx, t.gx);
    maxGy = Math.max(maxGy, t.gy);
  }
  const cols = maxGx - minGx + 1;
  const rows = maxGy - minGy + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cols * effW;
  canvas.height = rows * effH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageById = new Map(images.map((im) => [im.id, im]));
  for (const tile of tiles) {
    const image = imageById.get(tile.imageId);
    if (!image) continue;
    const bitmap = await createImageBitmap(image.blob);
    const sW = Math.max(1, bitmap.width - cropL - cropR);
    const sH = Math.max(1, bitmap.height - cropT - cropB);
    const dx = (tile.gx - minGx) * effW;
    const dy = (tile.gy - minGy) * effH;
    ctx.drawImage(bitmap, cropL, cropT, sW, sH, dx, dy, effW, effH);
    bitmap.close();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return { blob, filename: `${sanitizeFilename(game.name)}.png` };
}
