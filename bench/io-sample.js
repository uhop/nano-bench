const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export default {
  fast: async n => {
    for (let i = 0; i < n; ++i) await sleep(8 + 4 * Math.random());
  },
  slow: async n => {
    for (let i = 0; i < n; ++i) await sleep(12 + 8 * Math.random());
  }
};
