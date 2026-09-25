import test from 'tape-six';

import {parseParams, paramFileName, childArgv} from 'nano-benchmark/bench/params.js';

test('parseParams()', t => {
  t.deepEqual(parseParams('10, 100,1e3'), [10, 100, 1000]);
  t.deepEqual(parseParams('small,large'), ['small', 'large'], 'non-numbers stay strings');
  t.deepEqual(parseParams('1,,2,'), [1, 2], 'empty entries are dropped');
});

test('paramFileName()', t => {
  t.equal(paramFileName('out.json', 100), 'out-100.json');
  t.equal(
    paramFileName('dir/out.json', 'a b/c'),
    'dir/out-a_b_c.json',
    'unsafe characters replaced'
  );
  t.equal(paramFileName('out', 5), 'out-5.json', 'no extension: .json added');
});

test('childArgv()', t => {
  t.deepEqual(
    childArgv(['f.js', '-s', '20', '--json', 'x.json', '--params', '1,2', 'a'], {
      value: 2,
      json: 'x-2.json'
    }),
    ['f.js', '-s', '20', 'a', '--param-json', '2', '--json', 'x-2.json']
  );
  t.deepEqual(
    childArgv(['f.js', '--json=x.json', '--params=1'], {value: 'big', json: 'y.json'}),
    ['f.js', '--param-json', '"big"', '--json', 'y.json'],
    'the = forms are replaced too'
  );
});
