---
description: Pre-release verification checklist for nano-benchmark
---

# Release Check

Run through this checklist before publishing a new version.

## Steps

1. Check that `ARCHITECTURE.md` reflects any structural changes.
2. Check that `AGENTS.md` is up to date with any rule or workflow changes.
3. Check that dependent files (`.clinerules`, `.cursorrules`, `.windsurfrules`) are in sync with `AGENTS.md`.
4. Check that `wiki/Home.md` links to all wiki pages.
5. Check that `llms.txt` and `llms-full.txt` are up to date with any new or changed modules.
6. Verify `package.json`:
   - `files` array includes all necessary entries (`src`, `bin`, `llms.txt`, `llms-full.txt`).
   - `exports` map covers any new modules added since the last release.
7. Check that the copyright year in `LICENSE` includes the current year (e.g., update `2022` → `2022-2026` or `2005-2024` → `2005-2026`).
8. Bump `version` in `package.json`.
9. Update release history in `README.md`.
10. Run `npm install` to regenerate `package-lock.json`.
    // turbo
11. Run the full test suite with Node: `npm test`
    // turbo
12. Run tests with Bun: `npm run test:bun`
    // turbo
13. Run tests with Deno: `npm run test:deno`
    // turbo
14. Run Prettier lint check: `npm run lint`
    // turbo
15. Dry-run publish to verify package contents: `npm pack --dry-run`
