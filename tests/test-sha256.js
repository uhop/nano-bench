import test from 'tape-six';

import {createHash} from 'node:crypto';

import {sha256Hex} from 'nano-benchmark/utils/sha256.js';

const expected = bytes => createHash('sha256').update(bytes).digest('hex');

test('sha256Hex() matches node:crypto', t => {
  const encoder = new TextEncoder();
  for (const text of [
    '',
    'abc',
    'a'.repeat(55),
    'a'.repeat(56),
    'a'.repeat(64),
    'n => {\n  for (let i = 0; i < n; ++i) s += "é✓";\n}'
  ]) {
    const bytes = encoder.encode(text);
    t.equal(sha256Hex(bytes), expected(bytes), `${bytes.length} bytes`);
  }
  const random = new Uint8Array(10000).map((_, i) => (i * 2654435761) >>> 24);
  t.equal(sha256Hex(random), expected(random), '10,000 bytes');
});
