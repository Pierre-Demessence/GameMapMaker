# TODO / Backlog

Future improvements, not yet scheduled.

- [x] **Dark theme** — light/dark toggle. Defaults to the OS preference on first run and
  remembers the user's choice.

- [ ] **Better canvas controls (panning over tiles)** — today you can only pan by dragging
  **empty space**; pressing on a screenshot moves that tile instead. When zoomed in far there
  may be no empty space in view, so panning the camera becomes impossible without zooming out
  first. Options to explore:
  - Hold **Space** (or a modifier key) to force pan mode even when the pointer is over a tile.
  - **Middle-mouse** drag to pan.
  - A toolbar **Pan / Move mode** toggle (hand vs. arrow cursor).

- [ ] **Annotate screenshots** — let the user add annotations on top of rooms (text labels,
  arrows, or markers for items / exits / notes). Decisions to make: annotations per-tile vs.
  free-floating on the map, and whether they are included in the PNG export and the zip
  backup.
