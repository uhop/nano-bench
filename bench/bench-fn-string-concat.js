const fnS = (...args) => args.join('');
const fnB = (parts, ...args) => parts[0] + args.map((arg, i) => arg + parts[i + i]).join('');

export default {
  'strings-fn': n => {
    const x = [],
      a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) {
      x.pop();
      x.push(fnS(a, '-', b));
    }
    return x;
  },
  'backticks-fn': n => {
    const x = [],
      a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) {
      x.pop();
      x.push(fnB`${a}-${b}`);
    }
    return x;
  }
};
