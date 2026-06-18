import test from 'tape-six';

import {bodyHash} from 'nano-benchmark/utils/body-hash.js';

test('bodyHash()', t => {
  const plus = n => n + 1,
    plusCopy = n => n + 1,
    other = n => n - 1;

  t.ok(bodyHash(plus).startsWith('sha256:'), 'sha256: prefix');
  t.equal(bodyHash(plus), bodyHash(plus), 'stable for the same function');
  t.equal(bodyHash(plus), bodyHash(plusCopy), 'identical source → identical hash');
  t.ok(bodyHash(plus) !== bodyHash(other), 'different body → different hash');
});
