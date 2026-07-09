import test from 'tape-six';

import rusageDelta, {rusageAvailable} from 'nano-benchmark/bench/metrics.js';
import readProcMetrics, {procAvailable} from 'nano-benchmark/bench/proc-metrics.js';

test('rusage metrics', t => {
  t.test('rusageDelta subtracts the tracked fields', t => {
    const before = {
        userCPUTime: 100,
        systemCPUTime: 50,
        minorPageFault: 10,
        majorPageFault: 1,
        voluntaryContextSwitches: 5,
        involuntaryContextSwitches: 2
      },
      after = {
        userCPUTime: 350,
        systemCPUTime: 90,
        minorPageFault: 25,
        majorPageFault: 1,
        voluntaryContextSwitches: 9,
        involuntaryContextSwitches: 3
      };
    t.deepEqual(rusageDelta(before, after), {
      cpuUser: 250,
      cpuSystem: 40,
      minorPageFault: 15,
      majorPageFault: 0,
      voluntaryContextSwitches: 4,
      involuntaryContextSwitches: 1
    });
  });

  t.test('rusageAvailable returns a boolean', t => {
    t.equal(typeof rusageAvailable(), 'boolean');
  });
});

test('proc metrics', t => {
  t.test('readProcMetrics on self (when /proc exists) or null', t => {
    const reading = readProcMetrics(process.pid);
    if (procAvailable()) {
      t.ok(reading);
      t.ok(reading.peakRSS > 0);
      t.ok(reading.logicalRead >= 0 && reading.syscallRead >= 0);
    } else {
      t.equal(reading, null);
    }
  });

  t.test('a nonexistent pid yields null', t => {
    t.equal(readProcMetrics(2 ** 30), null);
  });
});
