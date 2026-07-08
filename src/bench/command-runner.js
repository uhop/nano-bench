import {spawn} from 'node:child_process';

// stdio ignored: child output would garble the live table and skew timing (hyperfine's default)
export const runCommand = command =>
  new Promise((resolve, reject) => {
    const child = spawn(command, {shell: true, stdio: 'ignore'});
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (signal) {
        reject(new Error(`Command killed by ${signal}: ${command}`));
      } else if (code) {
        reject(new Error(`Command failed with exit code ${code}: ${command}`));
      } else {
        resolve(code);
      }
    });
  });

export const commandFunctions = commands => {
  const fns = {};
  for (const command of commands) {
    fns[command] = () => runCommand(command);
  }
  return fns;
};

export default runCommand;
