# Markers — Plan

**Status:** done
**Owner:** Pierre
**Last updated:** 2026-08-17

## Scope

Two kinds of positioned annotations, on top of the existing room notes:

- **Room markers** — a pin inside a room, anchored to its tile. Label (e.g. "chest",
  "spawn"), icon, color, optional longer note. The position is stored as a fractional
  offset within the room, so the marker moves with the room when the tile is dragged.
  Markers can be dragged: within their room, or onto another room (re-anchoring them).
- **Zone links** — a connection between two rooms, for maps whose zones sit far apart.
  Drawn as an arrow (or a line) between two anchors, with a label, a direction
  (one-way vs two-way), and a **requirement note** describing when the player can
  teleport (e.g. "needs double jump", "opens after boss").

Both are rendered on the grid canvas, included in the zip backup, and drawn into the
PNG export (unlike notes, markers are visual). Phase 1 = room markers; Phase 2 = zone
links.

## Approach

### Data model (`src/lib/types.ts`)

```ts
export type MarkerIcon = "pin" | "star" | "flag" | "gem" | "skull";

export interface RoomMarker {
  id: string;
  gameId: string;
  tileId: string;
  u: number; // 0..1 offset within the room (horizontal)
  v: number; // 0..1 offset within the room (vertical)
  label: string;
  icon: MarkerIcon;
  color: string;
  note?: string;
  createdAt: number;
}

export interface ZoneLink {
  id: string;
  gameId: string;
  fromTileId: string;
  fromU: number;
  fromV: number;
  toTileId: string;
  toU: number;
  toV: number;
  label: string;
  twoWay: boolean; // true: teleport both ways; false: from → to only
  color: string;
  note?: string; // requirement: when the player can teleport
  createdAt: number;
}
```

### Persistence (`src/lib/db.ts`)

- Bump the DB to version 2. Upgrade callback: `if (oldVersion < 2)` create stores
  `markers` and `zoneLinks`, each with a `by-game` index. Keep the v1 creation code
  as-is for fresh installs.
- CRUD helpers mirroring tiles (`getMarkers`, `putMarker`, `deleteMarker`,
  `getZoneLinks`, …).
- `deleteGameCascade` also clears both new stores.
- Deleting a tile cascades: remove markers/links that reference it.

### Store (`src/store/mapStore.ts`)

- `markers: RoomMarker[]` and `zoneLinks: ZoneLink[]` in state, loaded on `selectGame`.
- Actions: `addMarker`, `updateMarker`, `deleteMarker`, `addZoneLink`, `updateZoneLink`,
  `deleteZoneLink`.

### Rendering & interaction (`src/components/GridCanvas.tsx`)

- Markers render as a layer above tiles inside the transformed world container, at
  `tile.gx * cellW + u * cellW` (world coords), with constant screen size like the
  existing note dot (`16 / view.scale`). Lucide icon (Pin, Star, Flag, …) in the
  marker color, label text next to it.
- Zone links render as an SVG overlay in the same container, world-coordinate lines
  between anchors with stroke width `2 / view.scale`, arrowheads for one-way links,
  and a small midpoint badge with the label; hover shows the requirement note.
- Click selects (outline), Delete/Backspace removes the selection (extend the existing
  key handler). Marker pointer handlers stop propagation so clicking a marker never
  starts a tile drag.

### Creation & editing UX

- Tile right-click menu gains "Add marker here…" (offset from the clicked point) and
  "Connect to…" (pending mode: next room click is the other end, Esc cancels).
- Marker editor dialog: label, icon picker, color picker, note. Link editor adds the
  `twoWay` toggle and the requirement note. Mirrors the note editor dialog.

### Backup & export

- Zip backup manifest carries `markers` and `zoneLinks` (export + import).
- PNG export draws markers and links (with labels) into the image.

## Later

- Marker list in the sidebar, free-floating markers, notes in the PNG export.

## Checklist

- [x] Types: `RoomMarker`, `ZoneLink`, `MarkerIcon`.
- [x] db v2 migration + CRUD helpers + tile/game cascade deletes.
- [x] Store: state + actions + load on `selectGame`.
- [x] Room marker pins on canvas + right-click "Add marker here…".
- [x] Marker editor dialog + select/Delete key.
- [x] Marker dragging (reposition within a room / drop onto another room).
- [x] Zone links: "Connect to…" pending mode + SVG arrows + badge.
- [x] Zone link editor (twoWay + requirement note).
- [x] Zip backup carries markers (export + import, tile ids remapped).
- [x] PNG export includes markers/links.
- [x] Build + lint + docs (`features.md`, `TODO.md`, `codebase.md`) — Phase 1.
- [x] Plan moved to `done/` in the final commit.
