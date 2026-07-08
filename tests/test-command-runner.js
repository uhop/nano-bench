import test from 'tape-six';

import runCommand, {commandFunctions} from 'nano-benchmark/bench/command-runner.js';

test('runCommand()', t => {
  t.test('successful command resolves', async t => {
    await runCommand('node -e "process.exit(0)"');
    t.ok(true);
  });

  t.test('non-zero exit rejects with the code and the command', async t => {
    try {
      await runCommand('node -e "process.exit(3)"');
      t.ok(false, 'should have rejected');
    } catch (error) {
      t.ok(/exit code 3/.test(String(error)));
      t.ok(/process\.exit\(3\)/.test(String(error)));
    }
  });

  t.test('a signal-killed command rejects', async t => {
    try {
      await runCommand('node -e "process.kill(process.pid, \'SIGKILL\')"');
      t.ok(false, 'should have rejected');
    } catch (error) {
      // Linux/macOS surface the signal; Windows emulates it as a non-zero exit code
      t.ok(/killed by SIG|exit code/.test(String(error)));
    }
  });

  t.test('commandFunctions adapts commands to benchmark functions', async t => {
    const commands = ['node -e "process.exit(0)"', 'node --version'],
      fns = commandFunctions(commands);
    t.deepEqual(Object.keys(fns), commands);
    await fns['node --version'](1);
    t.ok(true);
  });
});
