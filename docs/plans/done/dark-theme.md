# Dark Theme — Plan

**Status:** done
**Owner:** Pierre
**Last updated:** 2026-08-07

## Goal

Add a light/dark theme toggle. Default to the OS preference on first run; remember the
user's choice afterward.

## Approach

- shadcn base-nova already defines dark values under a `.dark` selector in `src/index.css`
  (`@custom-variant dark (&:is(.dark *))`). Toggling the `dark` class on `<html>` switches
  the theme.
- `src/lib/theme.ts`: read initial theme (localStorage → `prefers-color-scheme`), apply the
  class to the document element, persist the choice.
- Apply the initial theme in `src/main.tsx` before render to avoid a flash of the wrong
  theme.
- `src/components/ThemeToggle.tsx`: a sun/moon button, placed in the sidebar header.

## Checklist

- [x] `src/lib/theme.ts` (get / apply / store).
- [x] Apply initial theme in `main.tsx`.
- [x] `ThemeToggle` component.
- [x] Add toggle to the sidebar header.
- [x] Build + lint; commit.
