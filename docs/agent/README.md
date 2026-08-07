# Notes for AI Agents

Guidance for automated agents working in this repo. Read before making changes.

## Build and verify

```bash
npm run build   # tsc -b + vite build
npm run lint    # eslint (flat config)
npm run dev     # dev server (the owner usually runs this)
```

Run build + lint after changes. The owner typically runs `npm run dev` and does the
interactive/browser testing.

## Gotchas (verified)

- **TypeScript is pinned to `~5.9`** — do not upgrade to 7.x. TS 7 removed `baseUrl` (used
  here) and is not supported by `typescript-eslint` yet. The tsconfigs keep `baseUrl` +
  `paths`.
- **shadcn/ui is the base-nova style (Base UI, not Radix).** Compose with
  `render={<Component />}` (not `asChild`); menu items use `onClick` (not `onSelect`);
  dialogs use `open` / `onOpenChange`. Button sizes include `icon-sm`.
- **The shadcn theme CSS is vendored** at `src/shadcn-theme.css` (imported by
  `src/index.css`). Do **not** add the `shadcn` package as a dependency. To add components:
  `npx shadcn@latest add <name>`; if it re-injects `@import "shadcn/tailwind.css"` or the
  package, re-vendor the CSS and uninstall `shadcn`.
- **eslint-plugin-react-hooks v7 rules are strict** (React Compiler aware): no ref
  reads/writes during render (sync refs in effects; use state for render-time values); no
  synchronous `setState` in an effect body (prefer remount via `key`, or defer with
  `requestAnimationFrame`).
- **React StrictMode double-invokes effects.** Run-once guards that schedule a
  `requestAnimationFrame` must set the guard **inside** the rAF callback, or the cleanup
  between the two invocations cancels the work. See the fit-to-view effect in
  `GridCanvas.tsx`.
- Vite config uses `import.meta.dirname` (not `__dirname`).

## Conventions

- Layout math uses the **effective** (cropped) cell size; image rendering uses the original
  size offset by the crop.
- Object URLs are created on game load and revoked on switch / delete — keep that lifecycle
  intact when touching the store.
- Non-trivial work is tracked in `docs/plans/`. Completed plans move to `docs/plans/done/`.

## Workflow (owner: Pierre)

- Never `git commit` or `git push` without explicit per-commit permission. Commit permission
  is per-commit.
- The owner runs the dev server and does browser / E2E testing.
- Keep chat explanations in plain language; written docs and plans may use normal technical
  terms.
