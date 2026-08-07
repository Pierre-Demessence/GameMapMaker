# Game Map Maker — Implementation Plan

**Status:** done
**Owner:** Pierre
**Last updated:** 2026-08-07

## Goal

A fully client-side web tool to assemble game maps from same-sized screenshots by
snapping them onto a grid. First real target: *Leap Year* (all rooms one screen).
Must support multiple games, easy image input (Ctrl+V / drag-drop), and silent
auto-save/load so it behaves like installed software.

## Confirmed decisions

- **Stack:** TypeScript + Vite + React, 100% client-side (no backend).
- **Persistence:** IndexedDB as always-on auto-save (images stored as raw `Blob`s,
  not base64). Zip export/import for backups and moving maps between machines.
- **Grid cell size:** auto-detected from the first image dropped into a game;
  that size is locked per game.
- **Placement:** snap to grid, one image per cell, empty cells/gaps allowed
  anywhere. No overlap in MVP.
- **Multiple games:** each game is an independent project with its own grid and
  images.

## Tech choices

- **State:** Zustand (small, minimal boilerplate) for the active game + UI state.
- **IndexedDB wrapper:** `idb` (thin promise wrapper, avoids raw event API).
- **Zip:** `fflate` (tiny, fast) for export/import.
- **UI chrome:** Tailwind CSS + shadcn/ui (Radix-based components copied into the
  repo). Only the components we use: button, dialog, dropdown-menu, context-menu,
  tooltip, input. Canvas/grid remains custom.
- **Rendering:** DOM-based canvas — a pan/zoom container (CSS `transform`) with
  absolutely-positioned tile `<img>` elements. Simple drag + snap. Canvas2D is a
  possible later optimization if very large maps get slow; not needed for MVP.

## Data model

```
Game    { id, name, cellWidth, cellHeight, createdAt, updatedAt }
ImageRec{ id, gameId, blob, width, height, name }
Tile    { id, gameId, imageId, gx, gy }        // gx/gy = integer grid coords
```

IndexedDB object stores:

- `games`  (keyPath `id`)
- `images` (keyPath `id`, index `by-game` on `gameId`) — holds the `Blob`
- `tiles`  (keyPath `id`, index `by-game` on `gameId`)

Object URLs are created from blobs at load time and revoked on unload to avoid
memory leaks.

## User flows

1. **First run:** empty state → "Create game" → name it → empty grid.
2. **Add first image:** paste or drop → its pixel size becomes the game's cell
   size → placed at the cell nearest the drop point (or origin for paste).
3. **Add more images:** paste drops at view center's nearest free cell; drag-drop
   drops at the cell under the cursor. Snap to grid, gaps allowed.
4. **Rearrange:** drag a tile to another cell; snaps on release. Occupied target
   cell → swap or reject (MVP: reject/no-op).
5. **Delete tile:** select + Delete key, or right-click → remove.
6. **Pan/zoom:** wheel to zoom, drag empty space (or middle mouse) to pan.
7. **Switch games:** sidebar list; selecting reloads that game's grid.
8. **Backup:** export current game → `.zip` (manifest.json + images/). Import a
   `.zip` → new game.
9. **Auto-save:** every mutation persists to IndexedDB; reopening the app restores
   the last state with no user action.

## Phases & checklist

### Phase 0 — Scaffold
- [x] Vite + React + TS project, strict tsconfig, `.gitignore`.
- [x] Add deps: `zustand`, `idb`, `fflate`.
- [x] Tailwind CSS + shadcn/ui init (button, dialog, dropdown-menu, context-menu,
      tooltip, input).
- [x] Base layout: sidebar (games) + main canvas area.
- [x] ESLint/typecheck scripts wired.

### Phase 1 — Persistence layer
- [x] IndexedDB setup (`db.ts`) with the three stores + indexes.
- [x] CRUD for games / images / tiles.
- [x] Object-URL cache with create/revoke lifecycle.

### Phase 2 — Game management
- [x] Zustand store: games list, active game, tiles, images.
- [x] Create / rename / delete / switch game (sidebar UI).
- [x] Auto-load last-opened game on startup.

### Phase 3 — Grid canvas
- [x] Pan/zoom container with CSS transform.
- [x] Render tiles at `gx*cellW, gy*cellH`.
- [x] Cell size locked from first image.

### Phase 4 — Image input
- [x] Window paste (Ctrl+V) → decode image → place.
- [x] Drag-drop image file onto canvas → place at cursor cell.
- [x] First-image → set `cellWidth/Height`.

### Phase 5 — Editing
- [x] Drag tile to move + snap on release (reject occupied cell).
- [x] Select + delete tile.
- [x] Prevent pan while dragging a tile.

### Phase 6 — Backup (zip)
- [x] Export active game to `.zip` (manifest + images).
- [x] Import `.zip` → create new game with images + tiles.

### Phase 7 — Docs & polish
- [x] `README.md`, `docs/INDEX.md`, `docs/tech-stack.md`, `docs/codebase.md`,
      `docs/features.md`, `docs/agent/README.md`.
- [x] Empty states + basic keyboard/pointer UX pass.
- [x] Peer-review pass, fix items, then move this plan to `docs/plans/done/`.

## Open questions (non-blocking, can decide during build)

- Storage-pressure UX: warn if the browser signals it may evict data
  (`navigator.storage.persist()` request to reduce eviction risk).
- Occupied-cell drop: reject vs swap (MVP: reject).
- Whether to show grid coordinates / a minimap for large maps (later).
