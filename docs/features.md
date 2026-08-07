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
