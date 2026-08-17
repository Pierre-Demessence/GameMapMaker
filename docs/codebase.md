# Codebase

## Structure

```text
src/
  main.tsx            App entry
  App.tsx             Layout: sidebar + canvas; loads the last game on start
  index.css           Tailwind entry + theme variables
  shadcn-theme.css    Vendored shadcn base-nova CSS (variants/utilities)
  lib/
    types.ts          Game / ImageRec / Tile / RoomMarker / ZoneLink / CropKey / MarkerIcon
    db.ts             IndexedDB (stores: games, images, tiles, markers, zoneLinks, meta)
    backup.ts         Zip export/import
    exportImage.ts    Full-map PNG export
    utils.ts          cn() helper (shadcn)
  store/
    mapStore.ts       Zustand store + object-URL lifecycle
  components/
    Sidebar.tsx       Game list, CRUD, import/export
    GridCanvas.tsx    Pan/zoom, paste/drop, tile drag, fit, grid, crop rendering, markers
    CropControl.tsx   Crop panel
    ui/               Generated shadcn components
```

## Data model

```text
Game       { id, name, cellWidth, cellHeight, crop{Top,Right,Bottom,Left}?, createdAt, updatedAt }
ImageRec   { id, gameId, blob, width, height, name, createdAt }
Tile       { id, gameId, imageId, gx, gy, note? }   // gx/gy are integer grid coordinates
RoomMarker { id, gameId, tileId, u, v, label, icon, color, note?, createdAt }
ZoneLink   { id, gameId, fromTileId, fromU, fromV, toTileId, toU, toV, label, twoWay, color, note?, createdAt }
```

- The first image added to a game sets its `cellWidth` / `cellHeight`.
- Crop insets shrink the *effective* cell size; images are drawn offset inside an
  overflow-clipped tile so only the kept region shows. Layout (grid, positions, fit,
  export) uses the effective size.
- One image maps to one tile (1:1). Deleting a tile deletes its image and its markers.
- Markers are anchored to a room by `tileId` and a fractional offset `u`/`v` (0..1) inside
  it, so they stay put when the tile moves. `ZoneLink` is defined but not yet used (Phase 2).

## Persistence

IndexedDB object stores: `games`, `images` (index `by-game`), `tiles` (index `by-game`),
`markers` (index `by-game`), `zoneLinks` (index `by-game`, reserved for Phase 2), and `meta`
(e.g. last-opened game id). Deleting a game cascades to its images, tiles, markers, and
links. Object URLs for images are created on load and revoked on game switch / delete.

## Rendering and interaction

- The canvas is a pan/zoom container (CSS `transform`) with absolutely-positioned tiles at
  `gx*cellW, gy*cellH`.
- Screen-to-world transforms handle wheel zoom (toward the cursor), drag pan, and tile drag
  with snap on release.
- Tiles overlap by ~1 screen pixel (image scaled to fill) to avoid hairline seams at
  fractional zoom.
- The grid overlay follows the visible viewport, so it appears infinite.
