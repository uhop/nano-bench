import {rk23} from './rk.js';
import bsearch from './bsearch.js';

const findCriticalValue = (z, a, b) => {
  const fn = z => {
    if (z == 0 || z == 1) return 0;
    const result = Math.pow(z, a - 1) * Math.pow(1 - z, b - 1);
    return isFinite(result) ? result : 0;
  };
  const {ts, us, finalValue} = rk23(fn),
    value = finalValue * z,
    index = bsearch(us, x => x < value);
  if (!index) return ts[0];
  if (index >= us.length) return ts[ts.length - 1];
  if (z == us[index]) return ts[index];
  // linear interpolation
  return ts[index] - ((us[index] - value) / (us[index] - us[index - 1])) * (ts[index] - ts[index - 1]);
};

export default findCriticalValue;
