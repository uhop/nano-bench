import test from 'tape-six';

import {parseResults} from 'nano-benchmark/bench/results/load.js';

const throws = (t, fn, label) => {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  t.ok(threw, label);
};

test('parseResults()', t => {
  t.test('valid schema v1', t => {
    const parsed = parseResults(
      JSON.stringify({schemaVersion: 1, tool: 'nano-benchmark', results: []})
    );
    t.equal(parsed.schemaVersion, 1, 'schemaVersion');
    t.equal(parsed.tool, 'nano-benchmark', 'tool preserved');
  });
  t.test('rejects bad JSON', t => {
    throws(t, () => parseResults('{not json'), 'invalid JSON throws');
  });
  t.test('rejects an unsupported schemaVersion', t => {
    throws(t, () => parseResults(JSON.stringify({schemaVersion: 2})), 'schemaVersion 2 throws');
    throws(t, () => parseResults(JSON.stringify({})), 'missing schemaVersion throws');
  });
});
