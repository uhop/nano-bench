import {spawn} from 'node:child_process';

import {readProcMetrics} from './proc-metrics.js';

// stdio ignored: child output would garble the live table and skew timing (hyperfine's default)
export const runCommand = (command, options = {}) =>
  new Promise((resolve, reject) => {
    const {metrics, interval = 5} = options,
      child = spawn(command, {shell: true, stdio: 'ignore'});
    // /proc/<pid> vanishes at reap: poll while alive, keep the last good reading
    let last = null,
      timer = null;
    if (metrics) {
      const read = () => {
        const reading = readProcMetrics(child.pid);
        if (reading) last = reading;
      };
      read();
      timer = setInterval(read, interval);
      timer.unref?.();
    }
    child.once('error', error => {
      if (timer) clearInterval(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (timer) clearInterval(timer);
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
