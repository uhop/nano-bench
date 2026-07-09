const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// the first 8 calls take the slow path — simulated JIT/cache/connection warmup
let k = 0;

export default {
  warmy: async n => {
    for (let i = 0; i < n; ++i) await sleep(++k <= 8 ? 25 : 8);
  }
};
