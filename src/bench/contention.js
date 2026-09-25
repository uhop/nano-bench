const proc = /** @type {any} */ (globalThis).process;

const reader = read => () => {
  const usage = read();
  return (usage.user + usage.system) / 1000;
};

const threadClock =
    typeof proc?.threadCpuUsage == 'function' ? reader(() => proc.threadCpuUsage()) : null,
  processClock = typeof proc?.cpuUsage == 'function' ? reader(() => proc.cpuUsage()) : null;

// a clock is fine when it advances in steps of a millisecond or less; a tick-based one
// (Deno's threadCpuUsage moves in 10 ms steps, measured 2026-09-24) either stays put or jumps
const isFine = clock => {
  const start = clock(),
    deadline = performance.now() + 3;
  let now = start;
  while (now === start && performance.now() < deadline) now = clock();
  return now !== start && now - start <= 1;
};

let clock = null;

// CPU time in milliseconds, or NaN where the runtime has neither call. The thread's own time
// is preferred: process time also counts V8's compiler and GC threads and any worker threads
// (measured 2026-09-24: up to 1.2 on a spinning sample against 1.00 for the thread). Chosen by
// probing on first use, never by runtime detection.
export const cpuTime = () =>
  (clock ??= threadClock && isFine(threadClock) ? threadClock : (processClock ?? (() => NaN)))();

/** @returns {'thread' | 'process' | 'none'} the clock `cpuTime` uses */
export const cpuClockKind = () => {
  cpuTime();
  return clock === threadClock ? 'thread' : clock === processClock ? 'process' : 'none';
};

// measured 2026-09-24 on a 2-core / 4-thread i3: quiet samples read 1.00 (p10 0.995–1.000 on
// Node, Bun, and Deno); with every hardware thread taken, the median fell to 0.50
export const PREEMPTED_RATIO = 0.9;
export const WARN_FRACTION = 0.1;

/**
 * Summarizes per-sample CPU/elapsed ratios; NaN entries (async samples, no cpuUsage) are ignored.
 * @param {number[]} ratios
 * @returns {{samples: number, preempted: number, medianRatio: number} | null}
 */
export const contentionSummary = ratios => {
  const valid = ratios.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  return {
    samples: valid.length,
    preempted: valid.filter(ratio => ratio < PREEMPTED_RATIO).length,
    medianRatio: valid[valid.length >> 1]
  };
};

/** @param {{samples: number, preempted: number} | null | undefined} summary */
export const isContended = summary =>
  Boolean(summary && summary.samples > 0 && summary.preempted / summary.samples >= WARN_FRACTION);

/** @param {{samples: number, preempted: number}} summary */
export const contentionWarning = summary =>
  `${summary.preempted} of ${summary.samples} samples were preempted (CPU time under ${Math.round(
    100 * PREEMPTED_RATIO
  )}% of elapsed time): another process competed for the CPU, so the numbers read slow and noisy`;
