import test from 'tape-six';

import {formatDuration, progressBar, progressLine} from 'nano-benchmark/bench/render/progress.js';

const plain = s => s.replace(/\x1b\[[0-9;]*m/g, '');

test('progressBar()', t => {
  t.equal(plain(progressBar(0, 10)), '░'.repeat(10), 'empty');
  t.equal(plain(progressBar(1, 10)), '█'.repeat(10), 'full');
  t.equal(plain(progressBar(0.5, 10)), '█'.repeat(5) + '░'.repeat(5), 'half');
  t.equal(plain(progressBar(0.55, 10)), '█'.repeat(5) + '▌' + '░'.repeat(4), 'eighths');
  t.equal(plain(progressBar(2, 10)).length, 10, 'clamped above');
  t.equal(plain(progressBar(-1, 10)).length, 10, 'clamped below');
  for (let f = 0; f <= 1; f += 0.01) {
    if (plain(progressBar(f, 30)).length !== 30) t.fail(`width drifts at ${f}`);
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
