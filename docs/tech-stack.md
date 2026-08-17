# Tech Stack

## Runtime and build

- **TypeScript** — pinned to the 5.9 line (see note below).
- **Vite 8** — dev server and production build.
- **React 19** — UI.

## State and data

- **Zustand** — app state store (`src/store/mapStore.ts`).
- **idb** — thin promise wrapper over IndexedDB (`src/lib/db.ts`).
- **fflate** — zip pack/unpack for backups (`src/lib/backup.ts`).

## UI

- **Tailwind CSS v4** — utility styling (via `@tailwindcss/vite`).
- **shadcn/ui (base-nova style)** — components built on **Base UI**, generated into
  `src/components/ui/`.

## Key decisions

### TypeScript pinned to 5.9

TypeScript 7 (the native port) is available but is not yet supported by `typescript-eslint`
(peer range `<6.1.0`) and removed the `baseUrl` option. The project pins TypeScript to
`~5.9` and keeps `paths` (relative entries, no `baseUrl`) in the tsconfigs.

### shadcn base-nova uses Base UI, not Radix

Component composition uses the `render={<Component />}` prop (not Radix `asChild`); menu
items use `onClick` (not `onSelect`); dialogs use `open` / `onOpenChange`.

### Vendored shadcn theme CSS

shadcn's `init` injected `@import "shadcn/tailwind.css"`, which requires the heavy `shadcn`
CLI package at build time. That CSS is instead vendored at `src/shadcn-theme.css` and the
`shadcn` package is not a dependency. To add more components, run
`npx shadcn@latest add <name>`; if it re-adds the package or import, re-vendor the CSS and
uninstall `shadcn`.

### Client-side storage

Images are stored as blobs in IndexedDB (not base64), keeping size close to the original
files and well within browser quotas.
