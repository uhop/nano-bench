---
description: Checklist for adding a new internal module to nano-benchmark
---

# Add a New Module

Follow these steps when adding a new internal module under `src/`.

## Steps

1. Create `src/<name>.js` (or `src/<dir>/<name>.js`) with the implementation.
   - ESM only. Use `.js` extensions in all imports.
2. Create `tests/test-<name>.js` with automated tests (tape-six).
   // turbo
3. Run the new test: `node tests/test-<name>.js`
4. Update `ARCHITECTURE.md` — add the module to the project layout tree and dependency graph if applicable.
5. Update `llms.txt` and `llms-full.txt` if the module affects CLI behavior or public concepts.
6. Update `AGENTS.md` if the module changes the architecture quick reference.
7. Update dependent files (`.clinerules`, `.cursorrules`, `.windsurfrules`) to stay in sync with `AGENTS.md`.
   // turbo
8. Verify: `npm test`
   // turbo
9. Verify: `npm run lint`
