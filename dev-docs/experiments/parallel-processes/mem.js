// A random cycle over 32 MB (8 times the i3-10110U's L3): each step is a cache miss the
// prefetcher can't predict, so it is sensitive to shared L3 and memory bandwidth.
const SIZE = 8 * 1024 * 1024,
  next = new Int32Array(SIZE),
  order = new Int32Array(SIZE);
for (let i = 0; i < SIZE; ++i) order[i] = i;
let seed = 12345;
for (let i = SIZE - 1; i > 0; --i) {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  const j = seed % (i + 1),
    t = order[i];
  order[i] = order[j];
  order[j] = t;
}
for (let i = 0; i < SIZE; ++i) next[order[i]] = order[(i + 1) % SIZE];

let at = 0;

export default {
  chase: n => {
    let p = at;
    for (let i = 0; i < n; ++i) p = next[p];
    at = p;
    return p;
  }
};
