import show from 'nano-bench/bench/show.js';

await show({
  strings: n => {
    let x = '';
    const a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) x = a + '-' + b;
  },
  backticks: n => {
    let x = '';
    const a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) x = `${a}-${b}`;
  }
});

await show({
  "strings-fn": n => {
    let x = '';
    const a = 'a',
      b = 'b';
    const fn = (...args) => args.join('');
    for (let i = 0; i < n; ++i) x = fn(a, '-', b);
  },
  "backticks-fn": n => {
    let x = '';
    const a = 'a',
      b = 'b';
    const fn = (parts, ...args) => parts[0] + args.map((arg, i) => arg + parts[i + i]).join('');
    for (let i = 0; i < n; ++i) x = fn`${a}-${b}`;
  }
});
