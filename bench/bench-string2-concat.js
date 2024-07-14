export default {
  strings2: n => {
    const x = [],
      a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) {
      x.pop();
      x.push(a + '-' + b);
    }
    return x;
  },
  backticks2: n => {
    const x = [],
      a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) {
      x.pop();
      x.push(`${a}-${b}`);
    }
    return x;
  }
};
