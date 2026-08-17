import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Flag,
  Gem,
  Grid3x3,
  Link2,
  MapPin,
  Maximize2,
  Pencil,
  Skull,
  Star,
  StickyNote,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import type { MarkerIcon, Tile } from "@/lib/types";

const MIN_SCALE = 0.05;
const MAX_SCALE = 4;
const DEFAULT_MARKER_COLOR = "#f59e0b";
const DEFAULT_LINK_COLOR = "#3b82f6";

const MARKER_ICONS: Record<MarkerIcon, LucideIcon> = {
  pin: MapPin,
  star: Star,
  flag: Flag,
  gem: Gem,
  skull: Skull,
};

function arrowHeadPoints(
  tipX: number,
  tipY: number,
  dx: number,
  dy: number,
  size: number,
): string {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  return `${tipX},${tipY} ${tipX - ux * size + px * size * 0.5},${tipY - uy * size + py * size * 0.5} ${tipX - ux * size - px * size * 0.5},${tipY - uy * size - py * size * 0.5}`;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

type Interaction =
  | { mode: "none" }
  | { mode: "pan"; pointerId: number; lastX: number; lastY: number }
  | { mode: "drag"; pointerId: number; tileId: string; grabX: number; grabY: number }
  | { mode: "marker-drag"; pointerId: number; markerId: string }
  | { mode: "link-end-drag"; pointerId: number; linkId: string; end: "from" | "to" };

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
  const markers = useMapStore((s) => s.markers);
  const addMarker = useMapStore((s) => s.addMarker);
  const updateMarker = useMapStore((s) => s.updateMarker);
  const deleteMarker = useMapStore((s) => s.deleteMarker);
  const moveMarker = useMapStore((s) => s.moveMarker);
  const zoneLinks = useMapStore((s) => s.zoneLinks);
  const addZoneLink = useMapStore((s) => s.addZoneLink);
  const updateZoneLink = useMapStore((s) => s.updateZoneLink);
  const moveZoneLinkEnd = useMapStore((s) => s.moveZoneLinkEnd);
  const deleteZoneLink = useMapStore((s) => s.deleteZoneLink);

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
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [dragMarker, setDragMarker] = useState<{ markerId: string; x: number; y: number } | null>(null);
  const [dragLinkEnd, setDragLinkEnd] = useState<{
    linkId: string;
    end: "from" | "to";
    x: number;
    y: number;
  } | null>(null);
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
    | { kind: "marker"; markerId: string; x: number; y: number }
    | { kind: "link"; linkId: string; x: number; y: number }
    | { kind: "empty"; gx: number; gy: number; x: number; y: number }
    | null
  >(null);
  const [noteEditor, setNoteEditor] = useState<{ tileId: string; text: string } | null>(null);
  const [markerEditor, setMarkerEditor] = useState<{
    markerId: string;
    label: string;
    icon: MarkerIcon;
    color: string;
    note: string;
  } | null>(null);
  const [linkEditor, setLinkEditor] = useState<{
    linkId: string;
    label: string;
    twoWay: boolean;
    color: string;
    note: string;
  } | null>(null);
  const [pendingLink, setPendingLink] = useState<{
    fromTileId: string;
    u: number;
    v: number;
  } | null>(null);
  const [hoverNote, setHoverNote] = useState<{ text: string; x: number; y: number } | null>(null);
  const interaction = useRef<Interaction>({ mode: "none" });
  const pendingLinkEditor = useRef<{ linkId: string; tileId: string } | null>(null);
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
        setPendingLink((p) => (p?.fromTileId === selectedId ? null : p));
      } else if (selectedMarkerId) {
        e.preventDefault();
        void deleteMarker(selectedMarkerId);
        setSelectedMarkerId(null);
      } else if (selectedLinkId) {
        e.preventDefault();
        void deleteZoneLink(selectedLinkId);
        setSelectedLinkId(null);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pendingLink) setPendingLink(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onEscape);
    };
  }, [
    selectedId,
    selectedMarkerId,
    selectedLinkId,
    pendingLink,
    deleteTile,
    deleteMarker,
    deleteZoneLink,
  ]);

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

  const tileAtPoint = (wx: number, wy: number) =>
    tiles.find(
      (t) =>
        wx >= t.gx * cellW &&
        wx < (t.gx + 1) * cellW &&
        wy >= t.gy * cellH &&
        wy < (t.gy + 1) * cellH,
    );

  const fitToView = () => {
    const el = containerRef.current;
    if (!el) return;
    const next = computeFitView(el.getBoundingClientRect(), tiles, cellW, cellH);
    if (next) setView(next);
  };

  const openMarkerEditor = (markerId: string) => {
    const marker = markers.find((m) => m.id === markerId);
    if (!marker) return;
    setMarkerEditor({
      markerId: marker.id,
      label: marker.label,
      icon: marker.icon,
      color: marker.color,
      note: marker.note ?? "",
    });
  };

  const openLinkEditor = (linkId: string) => {
    const link = zoneLinks.find((l) => l.id === linkId);
    if (!link) return;
    setLinkEditor({
      linkId: link.id,
      label: link.label,
      twoWay: link.twoWay,
      color: link.color,
      note: link.note ?? "",
    });
  };

  const startPan = (e: ReactPointerEvent<Element>) => {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    setIsPanning(true);
    el.setPointerCapture(e.pointerId);
    interaction.current = { mode: "pan", pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  };

  const onBackgroundPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 0 && !isSpaceHeld) {
      setSelectedId(null);
      setSelectedMarkerId(null);
      setSelectedLinkId(null);
    }
    if (e.button === 0 && pendingLink) {
      setPendingLink(null);
      return;
    }
    startPan(e);
  };

  const onTilePointerDown = (e: ReactPointerEvent<HTMLDivElement>, tile: Tile) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (pendingLink && e.button === 0 && !isSpaceHeld) {
      e.stopPropagation();
      if (tile.id === pendingLink.fromTileId) {
        setPendingLink(null);
        return;
      }
      if (cellW > 0 && cellH > 0) {
        const w = screenToWorld(e.clientX, e.clientY);
        const u = Math.min(1, Math.max(0, (w.x - tile.gx * cellW) / cellW));
        const v = Math.min(1, Math.max(0, (w.y - tile.gy * cellH) / cellH));
        const from = pendingLink;
        setPendingLink(null);
        void addZoneLink({
          fromTileId: from.fromTileId,
          fromU: from.u,
          fromV: from.v,
          toTileId: tile.id,
          toU: u,
          toV: v,
          label: "Zone link",
          twoWay: true,
          color: DEFAULT_LINK_COLOR,
        }).then((id) => {
          if (id) pendingLinkEditor.current = { linkId: id, tileId: tile.id };
        });
      }
      return;
    }
    if (isSpaceHeld || e.button === 1) {
      e.stopPropagation();
      startPan(e);
      return;
    }
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    setSelectedId(tile.id);
    setSelectedMarkerId(null);
    setSelectedLinkId(null);
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
    } else if (it.mode === "marker-drag") {
      const w = screenToWorld(e.clientX, e.clientY);
      setDragMarker({ markerId: it.markerId, x: w.x, y: w.y });
    } else if (it.mode === "link-end-drag") {
      const w = screenToWorld(e.clientX, e.clientY);
      setDragLinkEnd({ linkId: it.linkId, end: it.end, x: w.x, y: w.y });
    }
  };

  const resetInteraction = () => {
    interaction.current = { mode: "none" };
    setDragPos(null);
    setDragTileId(null);
    setDragMarker(null);
    setDragLinkEnd(null);
    setIsPanning(false);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const it = interaction.current;
    if (it.mode === "drag" && cellW > 0 && cellH > 0) {
      const w = screenToWorld(e.clientX, e.clientY);
      const gx = Math.round((w.x - it.grabX) / cellW);
      const gy = Math.round((w.y - it.grabY) / cellH);
      void moveTile(it.tileId, gx, gy);
    } else if (it.mode === "marker-drag" && cellW > 0 && cellH > 0) {
      const w = screenToWorld(e.clientX, e.clientY);
      const marker = markers.find((m) => m.id === it.markerId);
      const tile = tileAtPoint(w.x, w.y);
      if (marker && tile) {
        const ownTile = tiles.find((t) => t.id === marker.tileId);
        const ox = ownTile ? ownTile.gx * cellW + marker.u * cellW : w.x;
        const oy = ownTile ? ownTile.gy * cellH + marker.v * cellH : w.y;
        if (Math.hypot(w.x - ox, w.y - oy) * viewRef.current.scale >= 4) {
          const u = Math.min(1, Math.max(0, (w.x - tile.gx * cellW) / cellW));
          const v = Math.min(1, Math.max(0, (w.y - tile.gy * cellH) / cellH));
          void moveMarker(it.markerId, tile.id, u, v);
        }
      }
    } else if (it.mode === "link-end-drag" && cellW > 0 && cellH > 0) {
      const w = screenToWorld(e.clientX, e.clientY);
      const link = zoneLinks.find((l) => l.id === it.linkId);
      const tile = tileAtPoint(w.x, w.y);
      if (link && tile) {
        const anchor =
          it.end === "from"
            ? { tileId: link.fromTileId, u: link.fromU, v: link.fromV }
            : { tileId: link.toTileId, u: link.toU, v: link.toV };
        const anchorTile = tiles.find((t) => t.id === anchor.tileId);
        const ax = anchorTile ? anchorTile.gx * cellW + anchor.u * cellW : w.x;
        const ay = anchorTile ? anchorTile.gy * cellH + anchor.v * cellH : w.y;
        if (Math.hypot(w.x - ax, w.y - ay) * viewRef.current.scale >= 4) {
          const u = Math.min(1, Math.max(0, (w.x - tile.gx * cellW) / cellW));
          const v = Math.min(1, Math.max(0, (w.y - tile.gy * cellH) / cellH));
          void moveZoneLinkEnd(it.linkId, it.end, tile.id, u, v);
        }
      }
    }
    resetInteraction();
  };

  const onPointerCancel = () => resetInteraction();

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

  let linkBounds: { left: number; top: number; w: number; h: number } | null = null;
  if (zoneLinks.length > 0 && cellW > 0 && cellH > 0 && tiles.length > 0) {
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
    linkBounds = {
      left: minGx * cellW,
      top: minGy * cellH,
      w: (maxGx - minGx + 1) * cellW,
      h: (maxGy - minGy + 1) * cellH,
    };
  }

  return (
    <>
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-muted/30 select-none"
      style={{ cursor: isPanning || dragMarker || dragLinkEnd ? "grabbing" : pendingLink ? "crosshair" : "grab" }}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={resetInteraction}
      onDragOver={onDragOver}
      onDrop={(e) => void onDrop(e)}
      onContextMenu={(e) => {
        if (cellW <= 0 || cellH <= 0) return;
        e.preventDefault();
        setPendingLink(null);
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
              onClick={(e) => {
                const pending = pendingLinkEditor.current;
                if (!pending || pending.tileId !== t.id) return;
                pendingLinkEditor.current = null;
                e.stopPropagation();
                setLinkEditor({
                  linkId: pending.linkId,
                  label: "Zone link",
                  twoWay: true,
                  color: DEFAULT_LINK_COLOR,
                  note: "",
                });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPendingLink(null);
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
                dragging ? "z-40 opacity-90" : "",
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
        {markers.map((m) => {
          const tile = tiles.find((t) => t.id === m.tileId);
          if (!tile) return null;
          const dragging = dragMarker?.markerId === m.id ? dragMarker : null;
          const x = dragging ? dragging.x : tile.gx * cellW + m.u * cellW;
          const y = dragging ? dragging.y : tile.gy * cellH + m.v * cellH;
          const size = 18 / view.scale;
          const Icon = MARKER_ICONS[m.icon] ?? MapPin;
          return (
            <div
              key={m.id}
              className={cn(
                "absolute z-30 flex cursor-pointer items-center gap-1.5",
                selectedMarkerId === m.id ? "outline-2 outline-primary" : "opacity-90 hover:opacity-100",
              )}
              style={{ left: x - size / 2, top: y - size / 2 }}
              onPointerDown={(e) => {
                if (e.button !== 0 && e.button !== 1) return;
                if (isSpaceHeld || e.button === 1) {
                  e.stopPropagation();
                  startPan(e);
                  return;
                }
                e.stopPropagation();
                setSelectedMarkerId(m.id);
                setSelectedId(null);
                setSelectedLinkId(null);
                const el = containerRef.current;
                if (!el) return;
                el.setPointerCapture(e.pointerId);
                const w = screenToWorld(e.clientX, e.clientY);
                setDragMarker({ markerId: m.id, x: w.x, y: w.y });
                interaction.current = { mode: "marker-drag", pointerId: e.pointerId, markerId: m.id };
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                openMarkerEditor(m.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedMarkerId(m.id);
                setMenu({ kind: "marker", markerId: m.id, x: e.clientX, y: e.clientY });
              }}
              onMouseEnter={(e) => {
                if (interaction.current.mode === "none") {
                  setHoverNote({
                    text: m.note ? `${m.label} — ${m.note}` : m.label,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }
              }}
              onMouseLeave={() => setHoverNote(null)}
            >
              <div
                className="pointer-events-none flex items-center justify-center rounded-full shadow-md ring-2 ring-background"
                style={{ width: size, height: size, backgroundColor: m.color }}
              >
                <Icon className="size-3/5 text-background" />
              </div>
              <span
                className="pointer-events-none rounded bg-background/80 px-1 py-0.5 font-medium text-foreground"
                style={{ fontSize: 11 / view.scale }}
              >
                {m.label}
              </span>
            </div>
          );
        })}
        {linkBounds && (
          <svg
            className="pointer-events-none absolute z-20"
            style={{ left: linkBounds.left, top: linkBounds.top, width: linkBounds.w, height: linkBounds.h }}
          >
            {zoneLinks.map((link) => {
              const from = tiles.find((t) => t.id === link.fromTileId);
              const to = tiles.find((t) => t.id === link.toTileId);
              if (!from || !to) return null;
              const dle = dragLinkEnd && dragLinkEnd.linkId === link.id ? dragLinkEnd : null;
              const sx =
                dle?.end === "from" ? dle.x - linkBounds.left : from.gx * cellW + link.fromU * cellW - linkBounds.left;
              const sy =
                dle?.end === "from" ? dle.y - linkBounds.top : from.gy * cellH + link.fromV * cellH - linkBounds.top;
              const tx =
                dle?.end === "to" ? dle.x - linkBounds.left : to.gx * cellW + link.toU * cellW - linkBounds.left;
              const ty =
                dle?.end === "to" ? dle.y - linkBounds.top : to.gy * cellH + link.toV * cellH - linkBounds.top;
              const dx = tx - sx;
              const dy = ty - sy;
              const mx = (sx + tx) / 2;
              const my = (sy + ty) / 2;
              const headSize = 10 / view.scale;
              const fs = 11 / view.scale;
              const labelW = link.label.length * fs * 0.6 + 10;
              const labelH = fs + 6;
              const selected = selectedLinkId === link.id;
              return (
                <g
                  key={link.id}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => {
                    if (e.button !== 0 && e.button !== 1) return;
                    if (isSpaceHeld || e.button === 1) {
                      e.stopPropagation();
                      startPan(e);
                      return;
                    }
                    e.stopPropagation();
                    setSelectedLinkId(link.id);
                    setSelectedId(null);
                    setSelectedMarkerId(null);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openLinkEditor(link.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedLinkId(link.id);
                    setMenu({ kind: "link", linkId: link.id, x: e.clientX, y: e.clientY });
                  }}
                  onMouseEnter={(e) => {
                    if (interaction.current.mode === "none") {
                      setHoverNote({
                        text: link.note ? `${link.label} — ${link.note}` : link.label,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }
                  }}
                  onMouseLeave={() => setHoverNote(null)}
                >
                  <path
                    d={`M ${sx} ${sy} L ${tx} ${ty}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14 / view.scale}
                  />
                  <line
                    x1={sx}
                    y1={sy}
                    x2={tx}
                    y2={ty}
                    stroke={link.color}
                    strokeWidth={2 / view.scale}
                  />
                  {link.twoWay ? (
                    <>
                      <polygon points={arrowHeadPoints(sx, sy, -dx, -dy, headSize)} fill={link.color} />
                      <polygon points={arrowHeadPoints(tx, ty, dx, dy, headSize)} fill={link.color} />
                    </>
                  ) : (
                    <polygon points={arrowHeadPoints(tx, ty, dx, dy, headSize)} fill={link.color} />
                  )}
                  <circle
                    cx={sx}
                    cy={sy}
                    r={5 / view.scale}
                    fill={link.color}
                    stroke="var(--background)"
                    strokeWidth={1.5 / view.scale}
                    className="pointer-events-none"
                  />
                  <circle
                    cx={sx}
                    cy={sy}
                    r={9 / view.scale}
                    fill="transparent"
                    className="cursor-grab"
                    onPointerDown={(e) => {
                      if (e.button !== 0 && e.button !== 1) return;
                      if (isSpaceHeld || e.button === 1) {
                        e.stopPropagation();
                        startPan(e);
                        return;
                      }
                      e.stopPropagation();
                      setSelectedLinkId(link.id);
                      setSelectedId(null);
                      setSelectedMarkerId(null);
                      const el = containerRef.current;
                      if (!el) return;
                      el.setPointerCapture(e.pointerId);
                      const w = screenToWorld(e.clientX, e.clientY);
                      setDragLinkEnd({ linkId: link.id, end: "from", x: w.x, y: w.y });
                      interaction.current = {
                        mode: "link-end-drag",
                        pointerId: e.pointerId,
                        linkId: link.id,
                        end: "from",
                      };
                    }}
                  />
                  <circle
                    cx={tx}
                    cy={ty}
                    r={5 / view.scale}
                    fill={link.color}
                    stroke="var(--background)"
                    strokeWidth={1.5 / view.scale}
                    className="pointer-events-none"
                  />
                  <circle
                    cx={tx}
                    cy={ty}
                    r={9 / view.scale}
                    fill="transparent"
                    className="cursor-grab"
                    onPointerDown={(e) => {
                      if (e.button !== 0 && e.button !== 1) return;
                      if (isSpaceHeld || e.button === 1) {
                        e.stopPropagation();
                        startPan(e);
                        return;
                      }
                      e.stopPropagation();
                      setSelectedLinkId(link.id);
                      setSelectedId(null);
                      setSelectedMarkerId(null);
                      const el = containerRef.current;
                      if (!el) return;
                      el.setPointerCapture(e.pointerId);
                      const w = screenToWorld(e.clientX, e.clientY);
                      setDragLinkEnd({ linkId: link.id, end: "to", x: w.x, y: w.y });
                      interaction.current = {
                        mode: "link-end-drag",
                        pointerId: e.pointerId,
                        linkId: link.id,
                        end: "to",
                      };
                    }}
                  />
                  <rect
                    x={mx - labelW / 2}
                    y={my - labelH / 2}
                    width={labelW}
                    height={labelH}
                    rx={labelH / 2}
                    fill="var(--popover)"
                    stroke={selected ? "var(--primary)" : "var(--border)"}
                    strokeWidth={selected ? 2 : 1}
                  />
                  <text
                    x={mx}
                    y={my}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fs}
                    fill="var(--popover-foreground)"
                  >
                    {link.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
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

      {pendingLink && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-sm text-foreground shadow ring-1 ring-border">
          Click the destination room to connect it · Esc to cancel
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
            {menu.kind === "tile" && (
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
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    const target = menu;
                    const tile = tiles.find((t) => t.id === target.tileId);
                    setMenu(null);
                    if (!tile || cellW <= 0 || cellH <= 0) return;
                    const w = screenToWorld(target.x, target.y);
                    const u = Math.min(1, Math.max(0, (w.x - tile.gx * cellW) / cellW));
                    const v = Math.min(1, Math.max(0, (w.y - tile.gy * cellH) / cellH));
                    void addMarker({
                      tileId: tile.id,
                      u,
                      v,
                      label: "Marker",
                      icon: "pin",
                      color: DEFAULT_MARKER_COLOR,
                    }).then((id) => {
                      if (id) {
                        setMarkerEditor({
                          markerId: id,
                          label: "Marker",
                          icon: "pin",
                          color: DEFAULT_MARKER_COLOR,
                          note: "",
                        });
                      }
                    });
                  }}
                >
                  <MapPin className="size-4" />
                  Add marker here…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    const target = menu;
                    const tile = tiles.find((t) => t.id === target.tileId);
                    setMenu(null);
                    if (!tile || cellW <= 0 || cellH <= 0) return;
                    const w = screenToWorld(target.x, target.y);
                    const u = Math.min(1, Math.max(0, (w.x - tile.gx * cellW) / cellW));
                    const v = Math.min(1, Math.max(0, (w.y - tile.gy * cellH) / cellH));
                    setPendingLink({ fromTileId: tile.id, u, v });
                  }}
                >
                  <Link2 className="size-4" />
                  Connect to…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    void deleteTile(menu.tileId);
                    setPendingLink(null);
                    setMenu(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete room
                </button>
              </>
            )}
            {menu.kind === "marker" && (
              <>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    const markerId = menu.markerId;
                    setMenu(null);
                    openMarkerEditor(markerId);
                  }}
                >
                  <Pencil className="size-4" />
                  Edit marker…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    void deleteMarker(menu.markerId);
                    setSelectedMarkerId(null);
                    setMenu(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete marker
                </button>
              </>
            )}
            {menu.kind === "link" && (
              <>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    const linkId = menu.linkId;
                    setMenu(null);
                    openLinkEditor(linkId);
                  }}
                >
                  <Pencil className="size-4" />
                  Edit link…
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    void deleteZoneLink(menu.linkId);
                    setSelectedLinkId(null);
                    setMenu(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete link
                </button>
              </>
            )}
            {menu.kind === "empty" && (
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
      <Dialog open={markerEditor !== null} onOpenChange={(open) => { if (!open) setMarkerEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marker</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              className="rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Label (e.g. chest, spawn…)"
              value={markerEditor?.label ?? ""}
              onChange={(e) => setMarkerEditor((s) => (s ? { ...s, label: e.target.value } : s))}
            />
            <div className="flex gap-1">
              {(Object.keys(MARKER_ICONS) as MarkerIcon[]).map((key) => {
                const Icon = MARKER_ICONS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border",
                      markerEditor?.icon === key
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                    onClick={() => setMarkerEditor((s) => (s ? { ...s, icon: key } : s))}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Color
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={markerEditor?.color ?? DEFAULT_MARKER_COLOR}
                onChange={(e) => setMarkerEditor((s) => (s ? { ...s, color: e.target.value } : s))}
              />
            </label>
            <textarea
              className="min-h-20 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Optional note about this marker…"
              value={markerEditor?.note ?? ""}
              onChange={(e) => setMarkerEditor((s) => (s ? { ...s, note: e.target.value } : s))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkerEditor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (markerEditor) {
                  void updateMarker(markerEditor.markerId, {
                    label: markerEditor.label,
                    icon: markerEditor.icon,
                    color: markerEditor.color,
                    note: markerEditor.note.trim() || undefined,
                  });
                }
                setMarkerEditor(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={linkEditor !== null} onOpenChange={(open) => { if (!open) setLinkEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zone link</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              className="rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Label (e.g. Zone 1 → Zone 2)"
              value={linkEditor?.label ?? ""}
              onChange={(e) => setLinkEditor((s) => (s ? { ...s, label: e.target.value } : s))}
            />
            <div className="flex gap-1">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm",
                  linkEditor?.twoWay
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
                onClick={() => setLinkEditor((s) => (s ? { ...s, twoWay: true } : s))}
              >
                <ArrowLeftRight className="size-4" />
                Both ways
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm",
                  linkEditor?.twoWay === false
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
                onClick={() => setLinkEditor((s) => (s ? { ...s, twoWay: false } : s))}
              >
                <ArrowRight className="size-4" />
                One way
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Color
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={linkEditor?.color ?? DEFAULT_LINK_COLOR}
                onChange={(e) => setLinkEditor((s) => (s ? { ...s, color: e.target.value } : s))}
              />
            </label>
            <textarea
              className="min-h-20 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Requirement — when can the player use this link? (e.g. needs double jump, opens after boss)"
              value={linkEditor?.note ?? ""}
              onChange={(e) => setLinkEditor((s) => (s ? { ...s, note: e.target.value } : s))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkEditor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (linkEditor) {
                  void updateZoneLink(linkEditor.linkId, {
                    label: linkEditor.label,
                    twoWay: linkEditor.twoWay,
                    color: linkEditor.color,
                    note: linkEditor.note.trim() || undefined,
                  });
                }
                setLinkEditor(null);
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
