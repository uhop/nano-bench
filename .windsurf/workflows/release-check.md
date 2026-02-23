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
7. Bump `version` in `package.json`.
8. Update release history in `README.md`.
9. Run `npm install` to regenerate `package-lock.json`.
   // turbo
10. Run the full test suite: `npm test`
    // turbo
11. Run Prettier lint check: `npm run lint`
    // turbo
12. Dry-run publish to verify package contents: `npm pack --dry-run`
