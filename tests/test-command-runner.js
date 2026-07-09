import test from 'tape-six';

import runCommand, {commandFunctions} from 'nano-benchmark/bench/command-runner.js';
import {procAvailable} from 'nano-benchmark/bench/proc-metrics.js';

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

  t.test('metrics callback fires once per run', async t => {
    const readings = [];
    await runCommand('node -e "setTimeout(() => {}, 30)"', {metrics: r => readings.push(r)});
    t.equal(readings.length, 1);
    if (procAvailable()) {
      t.ok(readings[0] && readings[0].peakRSS > 0);
    }
  });

  t.test('metrics reflect the command, not the wrapper shell', async t => {
    const readings = [];
    await runCommand(
      'node -e "process.stdout.write(Buffer.alloc(100000)); setTimeout(() => {}, 60)"',
      {metrics: r => readings.push(r)}
    );
    if (procAvailable()) {
      const reading = readings[0];
      t.ok(reading);
      t.ok(reading.logicalWrite >= 100000);
      t.ok(reading.peakRSS > 10 * 1024 * 1024);
    } else {
      t.ok(true);
    }
  });

  t.test('adaptive polling catches short commands', async t => {
    const readings = [];
    await runCommand('node -e "setTimeout(() => {}, 15)"', {metrics: r => readings.push(r)});
    t.equal(readings.length, 1);
    if (procAvailable()) {
      t.ok(readings[0] && readings[0].peakRSS > 0);
    } else {
      t.ok(true);
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
