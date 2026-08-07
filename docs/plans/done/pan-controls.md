# Pan Controls — Plan

**Status:** done
**Owner:** Pierre
**Last updated:** 2026-08-07

## Goal

Let the user pan the camera anywhere (including over screenshots), so panning works when
zoomed in with no empty space in view. Keep tile-dragging as the default left-drag.

## Chosen gestures

- **Hold Space + drag** to pan anywhere (temporary; release to return to moving tiles).
- **Middle-mouse drag** to pan anywhere.
- The existing drag-empty-space-to-pan stays.

Not doing now: hand/move toolbar toggle, trackpad two-finger pan, right-click pan.

## Approach (`GridCanvas.tsx`)

- Track `isSpaceHeld` via window `keydown`/`keyup` on `Space` (guard inputs; reset on blur).
- A `startPan(e)` helper shared by the background and tile pointer-down handlers.
- Tile pointer-down: if Space is held or the middle button is used → pan instead of moving
  the tile.
- Background pointer-down: left or middle button → pan (plain left on empty space also
  deselects).
- Cursor: `grab` when Space is held, `grabbing` while panning.

## Checklist

- [x] Space-held tracking effect.
- [x] `startPan` + pointer-down routing (Space / middle button).
- [x] Cursor feedback.
- [x] Build + lint; commit.
