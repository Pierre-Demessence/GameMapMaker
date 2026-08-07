import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Grid3x3, Maximize2, StickyNote, Trash2 } from "lucide-react";
import { useMapStore } from "@/store/mapStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CropControl } from "@/components/CropControl";
import { cn } from "@/lib/utils";
import type { Tile } from "@/lib/types";

const MIN_SCALE = 0.05;
const MAX_SCALE = 4;

interface View {
  x: number;
  y: number;
  scale: number;
}

type Interaction =
  | { mode: "none" }
  | { mode: "pan"; pointerId: number; lastX: number; lastY: number }
  | { mode: "drag"; pointerId: number; tileId: string; grabX: number; grabY: number };

function computeFitView(
  rect: { width: number; height: number },
  tiles: Tile[],
  cellW: number,
  cellH: number,
): View | null {
  if (cellW <= 0 || cellH <= 0 || tiles.length === 0) return null;
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
  const worldW = (maxGx - minGx + 1) * cellW;
  const worldH = (maxGy - minGy + 1) * cellH;
  const pad = 64;
  const scale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min((rect.width - pad) / worldW, (rect.height - pad) / worldH)),
  );
  const cx = minGx * cellW + worldW / 2;
  const cy = minGy * cellH + worldH / 2;
  return { scale, x: rect.width / 2 - cx * scale, y: rect.height / 2 - cy * scale };
}

export function GridCanvas() {
  const games = useMapStore((s) => s.games);
  const activeGameId = useMapStore((s) => s.activeGameId);
  const tiles = useMapStore((s) => s.tiles);
  const urls = useMapStore((s) => s.urls);
  const addImageAt = useMapStore((s) => s.addImageAt);
  const moveTile = useMapStore((s) => s.moveTile);
  const deleteTile = useMapStore((s) => s.deleteTile);
  const setTileNote = useMapStore((s) => s.setTileNote);
  const addEmptyTile = useMapStore((s) => s.addEmptyTile);

  const activeGame = games.find((g) => g.id === activeGameId) ?? null;
  const imgW = activeGame?.cellWidth ?? 0;
  const imgH = activeGame?.cellHeight ?? 0;
  const cropL = activeGame?.cropLeft ?? 0;
  const cropT = activeGame?.cropTop ?? 0;
  const cropR = activeGame?.cropRight ?? 0;
  const cropB = activeGame?.cropBottom ?? 0;
  const cellW = imgW > 0 ? Math.max(1, imgW - cropL - cropR) : 0;
  const cellH = imgH > 0 ? Math.max(1, imgH - cropT - cropB) : 0;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ x: 48, y: 48, scale: 1 });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragTileId, setDragTileId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [hadTilesOnLoad] = useState(() => tiles.length > 0);
  const [showGrid, setShowGrid] = useState(() => localStorage.getItem("gmm.showGrid") === "1");
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<
    | { kind: "tile"; tileId: string; x: number; y: number }
    | { kind: "empty"; gx: number; gy: number; x: number; y: number }
    | null
  >(null);
  const [noteEditor, setNoteEditor] = useState<{ tileId: string; text: string } | null>(null);
  const [hoverNote, setHoverNote] = useState<{ text: string; x: number; y: number } | null>(null);
  const interaction = useRef<Interaction>({ mode: "none" });
  const didFitRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("gmm.showGrid", showGrid ? "1" : "0");
  }, [showGrid]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const node = t as HTMLElement | null;
      return (
        !!node &&
        (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        setIsSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setIsSpaceHeld(false);
    };
    const onBlur = () => setIsSpaceHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const wx = (cx - v.x) / v.scale;
        const wy = (cy - v.y) / v.scale;
        return { scale, x: cx - wx * scale, y: cy - wy * scale };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!activeGameId) return;
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        let gx = 0;
        let gy = 0;
        const el = containerRef.current;
        if (el && cellW > 0 && cellH > 0) {
          const rect = el.getBoundingClientRect();
          const v = viewRef.current;
          gx = Math.floor((rect.width / 2 - v.x) / v.scale / cellW);
          gy = Math.floor((rect.height / 2 - v.y) / v.scale / cellH);
        }
        try {
          await addImageAt(file, gx, gy, "pasted");
        } catch {
          setError("Couldn't read that image.");
          window.setTimeout(() => setError(null), 4000);
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [activeGameId, cellW, cellH, addImageAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selectedId) {
        e.preventDefault();
        void deleteTile(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteTile]);

  // Fit the whole map into view once, when a game that already has rooms is loaded.
  useEffect(() => {
    if (didFitRef.current || !hadTilesOnLoad) return;
    const el = containerRef.current;
    if (!el || cellW <= 0 || cellH <= 0 || tiles.length === 0) return;
    const frame = requestAnimationFrame(() => {
      didFitRef.current = true;
      const next = computeFitView(el.getBoundingClientRect(), tiles, cellW, cellH);
      if (next) setView(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [tiles, cellW, cellH, hadTilesOnLoad]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - rect.left - v.x) / v.scale,
      y: (clientY - rect.top - v.y) / v.scale,
    };
  };

  const cellAt = (clientX: number, clientY: number) => {
    if (cellW <= 0 || cellH <= 0) return { gx: 0, gy: 0 };
    const w = screenToWorld(clientX, clientY);
    return { gx: Math.floor(w.x / cellW), gy: Math.floor(w.y / cellH) };
  };

  const fitToView = () => {
    const el = containerRef.current;
    if (!el) return;
    const next = computeFitView(el.getBoundingClientRect(), tiles, cellW, cellH);
    if (next) setView(next);
  };

  const startPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    setIsPanning(true);
    el.setPointerCapture(e.pointerId);
    interaction.current = { mode: "pan", pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  };

  const onBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 0 && !isSpaceHeld) setSelectedId(null);
    startPan(e);
  };

  const onTilePointerDown = (e: ReactPointerEvent<HTMLDivElement>, tile: Tile) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (isSpaceHeld || e.button === 1) {
      e.stopPropagation();
      startPan(e);
      return;
    }
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    setSelectedId(tile.id);
    setDragTileId(tile.id);
    el.setPointerCapture(e.pointerId);
    const w = screenToWorld(e.clientX, e.clientY);
    const tileX = tile.gx * cellW;
    const tileY = tile.gy * cellH;
    interaction.current = {
      mode: "drag",
      pointerId: e.pointerId,
      tileId: tile.id,
      grabX: w.x - tileX,
      grabY: w.y - tileY,
    };
    setDragPos({ x: tileX, y: tileY });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const it = interaction.current;
    if (it.mode === "pan") {
      const dx = e.clientX - it.lastX;
      const dy = e.clientY - it.lastY;
      it.lastX = e.clientX;
      it.lastY = e.clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else if (it.mode === "drag") {
      const w = screenToWorld(e.clientX, e.clientY);
      setDragPos({ x: w.x - it.grabX, y: w.y - it.grabY });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const it = interaction.current;
    if (it.mode === "drag" && cellW > 0 && cellH > 0) {
      const w = screenToWorld(e.clientX, e.clientY);
      const gx = Math.round((w.x - it.grabX) / cellW);
      const gy = Math.round((w.y - it.grabY) / cellH);
      void moveTile(it.tileId, gx, gy);
    }
    interaction.current = { mode: "none" };
    setDragPos(null);
    setDragTileId(null);
    setIsPanning(false);
  };

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const base = cellAt(e.clientX, e.clientY);
    let offset = 0;
    for (const file of files) {
      try {
        await addImageAt(file, base.gx + offset, base.gy, file.name);
      } catch {
        setError("Couldn't read that image.");
        window.setTimeout(() => setError(null), 4000);
      }
      offset++;
    }
  };

  if (!activeGame) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
        Create or select a game to start mapping.
      </div>
    );
  }

  const gridLineW = Math.min(Math.min(cellW, cellH) / 4 || 1, 1.5 / view.scale);
  let gridStyle: CSSProperties = {};
  if (cellW > 0 && cellH > 0) {
    const worldLeft = -view.x / view.scale;
    const worldTop = -view.y / view.scale;
    const worldRight = (containerSize.w - view.x) / view.scale;
    const worldBottom = (containerSize.h - view.y) / view.scale;
    const gLeft = (Math.floor(worldLeft / cellW) - 1) * cellW;
    const gTop = (Math.floor(worldTop / cellH) - 1) * cellH;
    const gRight = (Math.ceil(worldRight / cellW) + 1) * cellW;
    const gBottom = (Math.ceil(worldBottom / cellH) + 1) * cellH;
    gridStyle = {
      left: gLeft,
      top: gTop,
      width: gRight - gLeft,
      height: gBottom - gTop,
      backgroundImage: `linear-gradient(to right, var(--border) ${gridLineW}px, transparent ${gridLineW}px), linear-gradient(to bottom, var(--border) ${gridLineW}px, transparent ${gridLineW}px)`,
      backgroundSize: `${cellW}px ${cellH}px`,
      opacity: 0.8,
    };
  }

  // Overlap tiles by ~1 screen pixel so fractional-zoom rasterization leaves no seam,
  // scaling the image so the cropped region still fills the (slightly larger) tile.
  const bleed = 1 / view.scale;
  const fx = cellW > 0 ? (cellW + bleed) / cellW : 1;
  const fy = cellH > 0 ? (cellH + bleed) / cellH : 1;

  return (
    <>
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-muted/30 select-none"
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragOver={onDragOver}
      onDrop={(e) => void onDrop(e)}
      onContextMenu={(e) => {
        if (cellW <= 0 || cellH <= 0) return;
        e.preventDefault();
        const cell = cellAt(e.clientX, e.clientY);
        setMenu({ kind: "empty", gx: cell.gx, gy: cell.gy, x: e.clientX, y: e.clientY });
      }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {tiles.map((t) => {
          const dragging = dragTileId === t.id && dragPos !== null ? dragPos : null;
          const x = dragging ? dragging.x : t.gx * cellW;
          const y = dragging ? dragging.y : t.gy * cellH;
          const url = t.imageId ? urls[t.imageId] : undefined;
          return (
            <div
              key={t.id}
              onPointerDown={(e) => onTilePointerDown(e, t)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ kind: "tile", tileId: t.id, x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => {
                if (t.note && interaction.current.mode === "none") {
                  setHoverNote({ text: t.note, x: e.clientX, y: e.clientY });
                }
              }}
              onMouseLeave={() => setHoverNote(null)}
              className={cn(
                "absolute overflow-hidden",
                selectedId === t.id ? "z-10 outline-2 outline-primary" : "",
                dragging ? "z-20 opacity-90" : "",
              )}
              style={{ left: x, top: y, width: cellW + bleed, height: cellH + bleed, cursor: isSpaceHeld ? "grab" : "move" }}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none"
                  style={{ left: -cropL * fx, top: -cropT * fy, width: imgW * fx, height: imgH * fy }}
                />
              ) : (
                <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-muted-foreground/40 bg-muted/50" />
              )}
              {t.note && (
                <div
                  className="pointer-events-none absolute rounded-full bg-primary ring-2 ring-background"
                  style={{
                    width: 14 / view.scale,
                    height: 14 / view.scale,
                    top: 5 / view.scale,
                    right: 5 / view.scale,
                  }}
                />
              )}
            </div>
          );
        })}
        {showGrid && cellW > 0 && cellH > 0 && (
          <div aria-hidden className="pointer-events-none absolute" style={gridStyle} />
        )}
      </div>

      {tiles.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center">
          <div className="rounded-lg bg-background/80 px-4 py-3 text-sm text-muted-foreground shadow-sm ring-1 ring-border">
            Paste a screenshot (Ctrl+V) or drop an image here.
            <br />
            The first image sets the room size.
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
        {activeGame.name}
        {cellW > 0 ? ` · ${cellW}×${cellH}` : " · empty"} · {Math.round(view.scale * 100)}%
      </div>

      {error && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background px-3 py-1.5 text-sm text-destructive shadow ring-1 ring-destructive/30">
          {error}
        </div>
      )}

      {hoverNote && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-md bg-popover px-2.5 py-1.5 text-xs whitespace-pre-wrap text-popover-foreground shadow-md ring-1 ring-foreground/10"
          style={{ left: hoverNote.x + 12, top: hoverNote.y + 12 }}
        >
          {hoverNote.text}
        </div>
      )}

      {tiles.length > 0 && (
        <div
          className="absolute top-3 right-3 flex gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button variant="secondary" size="sm" onClick={fitToView}>
            <Maximize2 /> Fit
          </Button>
          <Button
            variant={showGrid ? "default" : "secondary"}
            size="sm"
            title="Toggle grid"
            onClick={() => setShowGrid((v) => !v)}
          >
            <Grid3x3 /> Grid
          </Button>
          <CropControl />
        </div>
      )}

      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onPointerDown={(e) => {
              e.stopPropagation();
              setMenu(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-44 rounded-md bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {menu.kind === "tile" ? (
              <>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    const target = tiles.find((t) => t.id === menu.tileId);
                    setNoteEditor({ tileId: menu.tileId, text: target?.note ?? "" });
                    setMenu(null);
                  }}
                >
                  <StickyNote className="size-4" />
                  {tiles.find((t) => t.id === menu.tileId)?.note ? "Edit note…" : "Add note…"}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    void deleteTile(menu.tileId);
                    setMenu(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete room
                </button>
              </>
            ) : (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  const target = menu;
                  setMenu(null);
                  void addEmptyTile(target.gx, target.gy).then((id) => {
                    if (id) setNoteEditor({ tileId: id, text: "" });
                  });
                }}
              >
                <StickyNote className="size-4" />
                Add room here…
              </button>
            )}
          </div>
        </>
      )}

    </div>
      <Dialog open={noteEditor !== null} onOpenChange={(open) => { if (!open) setNoteEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Room note</DialogTitle>
          </DialogHeader>
          <textarea
            autoFocus
            className="min-h-32 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Notes about this room…"
            value={noteEditor?.text ?? ""}
            onChange={(e) => setNoteEditor((s) => (s ? { ...s, text: e.target.value } : s))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteEditor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (noteEditor) void setTileNote(noteEditor.tileId, noteEditor.text);
                setNoteEditor(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
