# Features

## Games (projects)

Create, rename, delete, and switch games from the sidebar. The last-opened game is restored
on startup. Each game has its own grid size and images.

## Image input

- **Paste** (`Ctrl+V`) places the image at the cell nearest the view center.
- **Drag-and-drop** an image file places it at the cell under the cursor.
- The **first image** in a game sets the room (cell) size. Later images snap to that grid;
  if the target cell is taken, the nearest free cell is used.
- Unreadable images show a brief error instead of failing silently.

## Canvas navigation

- **Pan**: drag empty space.
- **Zoom**: mouse wheel (zooms toward the cursor).
- **Fit**: the *Fit* button (and an automatic fit when opening a map) frames the whole map.

## Arranging rooms

- **Move**: drag a tile; it snaps to the nearest cell on release. Occupied cells are not
  overwritten.
- **Select / Delete**: click a tile to select, press `Delete` (or `Backspace`) to remove it.

## Markers (room)

- **Add**: right-click a room → *Add marker here…* — the marker lands where you clicked,
  anchored to the room so it moves with it.
- **Move**: drag a marker to reposition it inside its room, or drop it on another room to
  re-anchor it there. Dropping outside any room cancels the move.
- **Edit**: double-click a marker, or right-click → *Edit marker…*: label, icon
  (pin / star / flag / gem / skull), color, and an optional note.
- **Select / Delete**: click to select, press `Delete` (or `Backspace`). Hovering a marker
  shows its label and note.
- Markers are stored with the game and included in the zip backup.

## Zone links

- **Add**: right-click a room → *Connect to…*, then click the destination room. Zones can
  sit far apart on the map; the link is drawn as an arrow between the two rooms.
- **Direction**: *Both ways* (teleport in either direction) or *One way* (exit-only).
- **Requirement**: an optional note describing when the player can use the link
  (e.g. "needs double jump", "opens after boss").
- **Edit**: double-click a link, or right-click → *Edit link…*; **delete** via
  `Delete`/`Backspace` or the right-click menu. Hovering shows the requirement.
- Links are stored with the game, included in the zip backup, and drawn into the PNG
  export (with labels), along with markers. In the PNG, links touching a placeholder room
  are skipped — like the placeholder itself.

## Crop

The *Crop* panel trims the same top / right / bottom / left margin from every image — useful
when a game's UI bar shifts the play area. The effective room size updates live; opposite
sides are clamped so at least 1px remains.

## Grid overlay

The *Grid* button toggles a cell-grid overlay (default off). The choice is remembered. Line
thickness is constant on screen at any zoom, and the grid follows the viewport.

## Export and backup

- **Export backup** (per game): downloads a `.zip` with `manifest.json` + images.
  **Import** (sidebar) rebuilds it as a new game. Invalid or image-less archives are
  rejected with a message.
- **Export image** (per game): renders the whole map to a single PNG at full resolution.
  Extremely large maps are rejected with a message.
