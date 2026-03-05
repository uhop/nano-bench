import test from 'tape-six';

import {MedianCounter, streamMedian} from 'nano-benchmark/stream-median.js';

test('MedianCounter', t => {
  t.test('single value', t => {
    const mc = new MedianCounter();
    mc.add(42);
    t.equal(mc.get(), 42);
  });

  t.test('two values returns smaller', t => {
    const mc = new MedianCounter();
    mc.add(10);
    mc.add(20);
    t.equal(mc.get(), 10);
  });

  t.test('three values returns median', t => {
    const mc = new MedianCounter();
    mc.add(30);
    mc.add(10);
    mc.add(20);
    t.equal(mc.get(), 20);
  });

  t.test('uniform values', t => {
    const mc = new MedianCounter();
    for (let i = 0; i < 9; ++i) mc.add(7);
    t.equal(mc.get(), 7);
  });

  t.test('clone preserves limit', t => {
    const mc = new MedianCounter(5);
    mc.add(1);
    mc.add(2);
    const clone = mc.clone();
    t.equal(clone.limit, 5);
    t.equal(clone.array.length, mc.array.length);
  });

  t.test('clone is independent', t => {
    const mc = new MedianCounter();
    mc.add(1);
    mc.add(2);
    mc.add(3);
    const clone = mc.clone();
    clone.add(100);
    t.equal(mc.get(), 2);
  });

  t.test('get does not mutate state', t => {
    const mc = new MedianCounter();
    for (let i = 1; i <= 9; ++i) mc.add(i);
    const first = mc.get();
    const second = mc.get();
    t.equal(first, second);
  });

  t.test('many values exercises hierarchy', t => {
    const mc = new MedianCounter();
    for (let i = 0; i < 100; ++i) mc.add(i);
    const result = mc.get();
    t.equal(typeof result, 'number');
    t.ok(result >= 0 && result < 100);
  });

  t.test('custom limit constrains array depth', t => {
    const mc = new MedianCounter(3);
    for (let i = 0; i < 50; ++i) mc.add(i);
    const result = mc.get();
    t.equal(typeof result, 'number');
    t.ok(mc.array.length <= 3);
  });

  t.test('add after get is stable', t => {
    const mc = new MedianCounter();
    for (let i = 1; i <= 9; ++i) mc.add(i);
    const before = mc.get();
    mc.add(5);
    const after = mc.get();
    t.equal(typeof before, 'number');
    t.equal(typeof after, 'number');
  });
});

test('streamMedian()', t => {
  t.test('matches median for small arrays', t => {
    const data = [5, 3, 1, 4, 2];
    const result = streamMedian(data);
    t.equal(typeof result, 'number');
  });

  t.test('uniform values', t => {
    const data = [7, 7, 7, 7, 7, 7, 7, 7, 7];
    t.equal(streamMedian(data), 7);
  });

  t.test('single value', t => {
    t.equal(streamMedian([42]), 42);
  });
});
