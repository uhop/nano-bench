import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';

import {readTreeMetrics} from './proc-metrics.js';

// stdio ignored: child output would garble the live table and skew timing (hyperfine's default)
export const runCommand = (command, options = {}) =>
  new Promise((resolve, reject) => {
    const {metrics, interval} = options,
      child = spawn(command, {shell: true, stdio: 'ignore'});
    // /proc/<pid> vanishes at reap: poll while alive, keep the last good reading;
    // adaptive backoff — dense while short commands are likely alive, cheap for long
    // runs; a fixed `interval` overrides the schedule
    let last = null,
      timer = null,
      done = false;
    if (metrics) {
      const started = performance.now();
      const read = () => {
        const reading = readTreeMetrics(child.pid);
        if (reading) last = reading;
      };
      const schedule = () => {
        if (done) return;
        const elapsed = performance.now() - started,
          delay = interval ?? (elapsed < 100 ? 1 : elapsed < 3000 ? 5 : 25);
        timer = setTimeout(() => {
          read();
          schedule();
        }, delay);
        timer.unref?.();
      };
      read();
      schedule();
    }
    child.once('error', error => {
      done = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      done = true;
      if (timer) clearTimeout(timer);
      if (metrics) metrics(last);
      if (signal) {
        reject(new Error(`Command killed by ${signal}: ${command}`));
      } else if (code) {
        reject(new Error(`Command failed with exit code ${code}: ${command}`));
      } else {
        resolve(code);
      }
    });
  });

export const commandFunctions = (commands, getOptions) => {
  const fns = {};
  for (const command of commands) {
    fns[command] = () => runCommand(command, getOptions?.(command));
  }
  return fns;
};

export default runCommand;
