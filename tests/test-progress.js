import test from 'tape-six';

import {formatDuration, progressLine} from 'nano-benchmark/bench/render/progress.js';

const plain = s => s.replace(/\x1b\[[0-9;]*m/g, '');

const bar = (done, total) => plain(progressLine({label: 'x', done, total})).slice(0, 30);

test('progressLine() bar', t => {
  t.equal(bar(0, 10), '░'.repeat(30), 'empty');
  t.equal(bar(10, 10), '█'.repeat(30), 'full');
  t.equal(bar(5, 10), '█'.repeat(15) + '░'.repeat(15), 'half');
  t.equal(bar(1, 16), '█' + '▉' + '░'.repeat(28), 'eighths');
  for (let done = 0; done <= 100; ++done) {
    if (plain(progressLine({label: 'x', done, total: 100})).indexOf(' ') !== 30) {
      t.fail(`width drifts at ${done}%`);
    }
  }
});

test('formatDuration()', t => {
  t.equal(formatDuration(0), '0s');
  t.equal(formatDuration(42_400), '42s');
  t.equal(formatDuration(125_000), '2m 05s');
});

test('progressLine()', t => {
  const line = plain(progressLine({label: 'sampling', done: 1, total: 4, remainingMs: 3000}));
  t.ok(line.includes(' 25% sampling'), 'percent and label');
  t.ok(line.endsWith('about 3s left'), 'time left');
  t.ok(
    plain(progressLine({label: 'x', done: 1, total: 2, remainingMs: 200})).endsWith(
      'less than a second left'
    ),
    'sub-second'
  );
  t.notOk(plain(progressLine({label: 'x', done: 0, total: 0})).includes('left'), 'no estimate');
});
