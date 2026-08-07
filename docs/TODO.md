# TODO / Backlog

Future improvements, not yet scheduled.

## Dark theme

Add a light/dark theme toggle. Theme variables already exist (the `.dark` block in
`src/index.css`); wire a toggle that sets the `dark` class on the root element and persists
the choice (e.g. in `localStorage`).

## Better canvas controls (panning over tiles)

Today you can only pan by dragging **empty space** — pressing on a screenshot moves that
tile instead. When zoomed in far there may be no empty space in view, so panning the camera
becomes impossible without zooming out first.

Options to explore:

- Hold **Space** (or a modifier key) to force pan mode even when the pointer is over a tile.
- **Middle-mouse** drag to pan.
- A toolbar **Pan / Move mode** toggle (hand vs. arrow cursor).

## Annotate screenshots

Let the user add annotations on top of rooms — e.g. text labels, arrows, or markers for
items / exits / notes. Decisions to make: annotations per-tile vs. free-floating on the map,
and whether they are included in the PNG export and the zip backup.
