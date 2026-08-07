# Annotations (Room Notes) — Plan

**Status:** done
**Owner:** Pierre
**Last updated:** 2026-08-07

## Scope (v1)

- **Attached to a room/tile** (free-floating notes are a later idea).
- **Text only** — one note per room.
- **Right-click context menu** on a tile to add/edit the note (and delete the room).
- **Empty rooms**: right-click an empty cell to add a placeholder room (no screenshot yet),
  which can also hold a note. Placeholders render as dashed cells and are excluded from the
  PNG export.
- Included in the **zip backup**; **not** drawn into the PNG image export.

## Approach

- `Tile.note?: string` on the tile record (1:1 with the room).
- Store action `setTileNote(tileId, note)`.
- `GridCanvas`: right-click a tile → a small context menu (Add/Edit note…, Delete room).
  The note is edited in a dialog with a textarea. A small corner dot marks rooms that have a
  note.
- The backup manifest carries `note`; import restores it. PNG export ignores notes.

## Later

- Free-floating annotations, markers, arrows, and showing notes in the PNG export.

## Checklist

- [x] `Tile.note` + `setTileNote` store action.
- [x] Right-click context menu (edit note / delete room).
- [x] Note editor dialog + note indicator dot.
- [x] Empty tiles (placeholder rooms) + right-click empty cell to add.
- [x] Constant-size note dot + hover tooltip.
- [x] Include note in zip backup (export + import).
- [x] Build + lint; commit.
