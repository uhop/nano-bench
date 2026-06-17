import test from 'tape-six';

import selectFunctions from 'nano-benchmark/bench/select-functions.js';

const f = () => {};
const grab = thunk => {
  try {
    thunk();
  } catch (e) {
    return e;
  }
};

test('selectFunctions()', t => {
  t.test('no methods requested → all functions, in declaration order', t => {
    t.deepEqual(selectFunctions({a: f, b: f, c: f}, []), ['a', 'b', 'c']);
  });

  t.test('subset requested → that subset, in requested order', t => {
    t.deepEqual(selectFunctions({a: f, b: f, c: f}, ['c', 'a']), ['c', 'a']);
  });

  t.test('single method → single-element list (baseline)', t => {
    t.deepEqual(selectFunctions({a: f, b: f}, ['a']), ['a']);
  });

  t.test('non-function properties are ignored', t => {
    t.deepEqual(selectFunctions({a: f, n: 42, b: f}, []), ['a', 'b']);
  });

  t.test('unknown method throws and lists available names', t => {
    const e = grab(() => selectFunctions({a: f, b: f}, ['x']));
    t.ok(e instanceof Error);
    t.ok(/Available: a, b/.test(e.message));
  });

  t.test('export with no functions throws', t => {
    const e = grab(() => selectFunctions({n: 42}, []));
    t.ok(e instanceof Error);
  });
});
