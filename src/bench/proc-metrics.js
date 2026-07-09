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
