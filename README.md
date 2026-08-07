# Game Map Maker

A fully client-side tool for assembling game maps from same-sized screenshots. Paste or
drop screenshots of a game's rooms onto a grid and they snap into place, so the whole map
comes together like a mosaic. Built for games like *Leap Year* where every room fits one
screen.

## Features

- **Multiple games** — each map is a separate project; create, rename, delete, and switch.
- **Auto-save** — everything persists to the browser's IndexedDB automatically; reopen the
  app and your maps are still there. No manual save/load.
- **Easy image input** — paste a screenshot with `Ctrl+V` or drag-and-drop an image file.
  The first image sets the room (cell) size for that game.
- **Grid canvas** — pan by dragging, zoom with the mouse wheel, and fit the whole map to view.
- **Arrange rooms** — drag tiles between cells (snaps on release; won't overwrite an occupied
  cell); select and press `Delete` to remove.
- **Uniform crop** — trim the same margin from every image (handy when a UI bar shifts the
  game) so rooms tile tightly.
- **Grid overlay** — toggle a cell grid over the map.
- **Export** — download a `.zip` backup (layout + images) to re-import later, or export the
  whole map as a single PNG.

## Storage

The app is 100% client-side. Maps and images are stored in **IndexedDB** (images as raw
blobs, not base64), which holds far more than `localStorage`. Saving and loading happen
automatically in the background. Use **Export backup** for portable `.zip` copies.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run lint     # ESLint
```

Open the local URL printed by `npm run dev`, create a game, and paste or drop a screenshot.

## Tech stack

TypeScript, Vite, React 19, Zustand, Tailwind CSS v4 + shadcn/ui, `idb` (IndexedDB), and
`fflate` (zip). See [docs/tech-stack.md](docs/tech-stack.md).

## Documentation

- [docs/INDEX.md](docs/INDEX.md) — documentation index
- [docs/features.md](docs/features.md) — feature details
- [docs/codebase.md](docs/codebase.md) — architecture and code layout
- [docs/tech-stack.md](docs/tech-stack.md) — stack and key decisions
- [docs/agent/README.md](docs/agent/README.md) — notes for AI agents
