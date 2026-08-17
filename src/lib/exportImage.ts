import * as db from "@/lib/db";

function sanitizeFilename(name: string): string {
  return (name.trim() || "map").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dx: number,
  dy: number,
  size: number,
): void {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * size + px * size * 0.5, tipY - uy * size + py * size * 0.5);
  ctx.lineTo(tipX - ux * size - px * size * 0.5, tipY - uy * size - py * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  fontSize: number,
): void {
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, fontSize * 0.2);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export async function exportGameImage(
  gameId: string,
): Promise<{ blob: Blob; filename: string } | null> {
  const game = await db.getGame(gameId);
  if (!game || game.cellWidth === 0) return null;
  const [allTiles, images, markers, zoneLinks] = await Promise.all([
    db.getTiles(gameId),
    db.getImages(gameId),
    db.getMarkers(gameId),
    db.getZoneLinks(gameId),
  ]);
  const tiles = allTiles.filter((t) => t.imageId);
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
  const fullW = cols * effW;
  const fullH = rows * effH;

  // Fit within browser canvas limits, downscaling only very large maps.
  const MAX_DIM = 32767;
  const MAX_AREA = 300_000_000;
  const scale = Math.min(
    1,
    MAX_DIM / fullW,
    MAX_DIM / fullH,
    Math.sqrt(MAX_AREA / (fullW * fullH)),
  );
  const width = Math.max(1, Math.round(fullW * scale));
  const height = Math.max(1, Math.round(fullH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageById = new Map(images.map((im) => [im.id, im]));
  for (const tile of tiles) {
    if (!tile.imageId) continue;
    const image = imageById.get(tile.imageId);
    if (!image) continue;
    const bitmap = await createImageBitmap(image.blob);
    const sW = Math.max(1, bitmap.width - cropL - cropR);
    const sH = Math.max(1, bitmap.height - cropT - cropB);
    const dx = (tile.gx - minGx) * effW * scale;
    const dy = (tile.gy - minGy) * effH * scale;
    ctx.drawImage(bitmap, cropL, cropT, sW, sH, dx, dy, effW * scale, effH * scale);
    bitmap.close();
  }

  const tileById = new Map(allTiles.map((t) => [t.id, t]));
  const markerR = Math.max(6, Math.min(0.03 * Math.min(effW, effH), 24)) * scale;

  for (const marker of markers) {
    const tile = tileById.get(marker.tileId);
    if (!tile?.imageId) continue;
    const mx = (tile.gx - minGx + marker.u) * effW * scale;
    const my = (tile.gy - minGy + marker.v) * effH * scale;
    ctx.beginPath();
    ctx.arc(mx, my, markerR, 0, Math.PI * 2);
    ctx.fillStyle = marker.color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
    drawLabel(ctx, marker.label, mx + markerR + 4 * scale, my, marker.color, Math.max(10, markerR * 1.1));
  }

  const headSize = markerR * 0.8;
  for (const link of zoneLinks) {
    const from = tileById.get(link.fromTileId);
    const to = tileById.get(link.toTileId);
    if (!from?.imageId || !to?.imageId) continue;
    const sx = (from.gx - minGx + link.fromU) * effW * scale;
    const sy = (from.gy - minGy + link.fromV) * effH * scale;
    const tx = (to.gx - minGx + link.toU) * effW * scale;
    const ty = (to.gy - minGy + link.toV) * effH * scale;
    const dx = tx - sx;
    const dy = ty - sy;
    ctx.strokeStyle = link.color;
    ctx.lineWidth = Math.max(2, 2.5 * scale);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = link.color;
    if (link.twoWay) {
      drawArrowHead(ctx, sx, sy, -dx, -dy, headSize);
      drawArrowHead(ctx, tx, ty, dx, dy, headSize);
    } else {
      drawArrowHead(ctx, tx, ty, dx, dy, headSize);
    }
    drawLabel(
      ctx,
      link.label,
      (sx + tx) / 2,
      (sy + ty) / 2,
      link.color,
      Math.max(10, markerR),
    );
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return { blob, filename: `${sanitizeFilename(game.name)}.png` };
}
