import test from 'tape-six';

import findGc, {gcModes} from 'nano-benchmark/bench/gc.js';

test('findGc()', async t => {
  const gc = await findGc();
  t.equal(typeof gc, 'function', 'Node, Bun, and Deno each offer a collector');
  t.doesNotThrow(() => gc(), 'a collection runs');
  t.deepEqual(gcModes, ['none', 'once', 'each']);
});
