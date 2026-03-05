---
description: Update AI-facing documentation files after API or architecture changes
---

# AI Documentation Update

Update all AI-facing files after changes to the public API, CLI utilities, or project structure.

## Steps

1. Read `bin/nano-bench.js` and `bin/nano-watch.js` to identify the current CLI options and behavior.
2. Read `AGENTS.md` and `ARCHITECTURE.md` for current state.
3. Update `llms.txt`:
   - Ensure the CLI options section matches the current binaries.
   - Update common patterns if new features were added.
   - Keep it concise — this is for quick LLM consumption.
4. Update `llms-full.txt`:
   - Full CLI reference with all options, output format, and examples.
   - Include any new CLI options or statistical methods.
5. Update `ARCHITECTURE.md` if project structure or module dependencies changed.
6. Update `AGENTS.md` if critical rules, commands, or architecture quick reference changed.
7. Sync `.windsurfrules`, `.cursorrules`, `.clinerules` if `AGENTS.md` critical rules or code style changed:
   - These three files should be identical copies.
8. Update `wiki/Home.md` if the overview needs to reflect new features.
9. Track progress with the todo list and provide a summary when done.
