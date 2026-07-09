import {readFileSync} from 'node:fs';

const num = (source, key) => {
  const match = source.match(new RegExp('^' + key + ':\\s+(\\d+)', 'm'));
  return match ? +match[1] : 0;
};

export const procAvailable = () => {
  try {
    readFileSync('/proc/self/io');
    return true;
  } catch {
    return false;
  }
};

const descendants = pid => {
  const pids = [pid];
  for (let i = 0; i < pids.length; ++i) {
    try {
      const kids = readFileSync(`/proc/${pids[i]}/task/${pids[i]}/children`, 'utf8').trim();
      if (kids) pids.push(...kids.split(/\s+/).map(Number));
    } catch {}
  }
  return pids;
};

const IO_KEYS = [
  'logicalRead',
  'logicalWrite',
  'physicalRead',
  'physicalWrite',
  'syscallRead',
  'syscallWrite'
];

// the wrapper shell forks the command (dash does not exec here) and its own readings
// must never pass as the command's — only descendants count; io is summed over the
// live tree, peakRSS is the max of any single process
export const readTreeMetrics = pid => {
  let reading = null;
  for (const target of descendants(pid).slice(1)) {
    const one = readProcMetrics(target);
    if (!one) continue;
    if (reading) {
      reading.peakRSS = Math.max(reading.peakRSS, one.peakRSS);
      for (const key of IO_KEYS) reading[key] += one[key];
    } else {
      reading = one;
    }
  }
  return reading;
};

export const readProcMetrics = pid => {
  try {
    const io = readFileSync(`/proc/${pid}/io`, 'utf8'),
      status = readFileSync(`/proc/${pid}/status`, 'utf8');
    return {
      peakRSS: num(status, 'VmHWM') * 1024,
      logicalRead: num(io, 'rchar'),
      logicalWrite: num(io, 'wchar'),
      physicalRead: num(io, 'read_bytes'),
      physicalWrite: num(io, 'write_bytes'),
      syscallRead: num(io, 'syscr'),
      syscallWrite: num(io, 'syscw')
    };
  } catch {
    return null;
  }
};

export default readProcMetrics;
