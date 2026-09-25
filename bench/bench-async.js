// Asynchronous functions for trying `--parallel N`: each call awaits, so calls in a round overlap.
export default {
  microtasks: async n => {
    for (let i = 0; i < n; ++i) await Promise.resolve();
  },
  timer: n =>
    new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      let s = 0;
      for (let i = 0; i < n; ++i) s += i;
      return s;
    })
};
