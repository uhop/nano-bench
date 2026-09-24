import {spawn} from 'node:child_process';
import process from 'node:process';

// the one runtime-specific piece: Deno needs `run -A` before the script
export const runtimeArgs = () => (/** @type {any} */ (globalThis).Deno ? ['run', '-A'] : []);

/**
 * @param {string} script
 * @param {string[]} args
 * @returns {Promise<any>} the child's stdout parsed as JSON
 */
export const runChild = (script, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...runtimeArgs(), script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '',
      err = '';
    child.stdout.setEncoding('utf8').on('data', chunk => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (err += chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error(`child output is not JSON: ${out.slice(0, 200)}`));
        }
        return;
      }
      const how = signal ? `was killed by ${signal}` : `exited with code ${code}`;
      reject(new Error(`child process ${how}: ${(err || out).trim()}`));
    });
  });

/**
 * The order to start processes in: `repeat` processes for each of `count` functions.
 * @param {number} count
 * @param {number} repeat
 * @param {'interleaved' | 'sequential'} order
 * @returns {{fn: number, round: number}[]}
 */
export const isolationPlan = (count, repeat, order) => {
  const plan = [];
  if (order === 'sequential') {
    for (let fn = 0; fn < count; ++fn) {
      for (let round = 0; round < repeat; ++round) plan.push({fn, round});
    }
    return plan;
  }
  for (let round = 0; round < repeat; ++round) {
    // rotate the start so no function always goes first in a round
    for (let j = 0; j < count; ++j) plan.push({fn: (round + j) % count, round});
  }
  return plan;
};

/**
 * How often each function had the lowest median across a round of processes.
 * @param {number[][]} medians medians[fn][round]
 * @returns {number[]} wins per function
 */
export const fastestPerRound = medians => {
  const count = medians.length,
    rounds = Math.min(...medians.map(m => m.length)),
    wins = new Array(count).fill(0);
  for (let round = 0; round < rounds; ++round) {
    let best = 0;
    for (let fn = 1; fn < count; ++fn) {
      if (medians[fn][round] < medians[best][round]) best = fn;
    }
    ++wins[best];
  }
  return wins;
};
