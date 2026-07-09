const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// deterministic fast/slow mix: every 4th call takes the slow path (75/25 split)
let k = 0;

export default {
  mixed: async n => {
    for (let i = 0; i < n; ++i) await sleep(++k % 4 ? 8 : 30);
  }
};
