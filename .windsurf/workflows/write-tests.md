---
description: Write or update tape-six tests for a module or feature
---

# Write Tests

Write or update tests using the tape-six testing library.

## Notes

- `tape-six` supports ES modules (`.js`, `.mjs`).
- The default `tape6` runner uses worker threads for parallel execution.
- No TypeScript — all test files are plain `.js`.

## Steps

1. Identify the module or feature to test. Read its source code to understand the API.
2. Create or update the test file in `tests/test-<name>.js`:
   - Import `test` from `tape-six` (ESM: `import test from 'tape-six'`).
   - Import the module under test using its `nano-benchmark/` package path.
   - Write one top-level `test()` per logical group.
   - Use embedded `t.test()` for sub-cases.
   - Cover: normal operation, edge cases, error conditions.
   - Use `t.equal` for primitives, `t.deepEqual` for objects/arrays, `t.ok` for boolean checks, `t.throws` for errors.
     // turbo
3. Run the new test file directly to verify: `node tests/test-<name>.js`
   // turbo
4. Run the full test suite to check for regressions: `npm test`
5. Report results and any failures.
