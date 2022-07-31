import {rk23} from './rk.js';
import bsearch from './bsearch.js';

// percent point function
const ppf = (fn, z, options) => {
  const {ts, us, finalValue} = rk23(fn, options),
    value = finalValue * z,
    index = bsearch(us, x => x < value);
  if (!index) return ts[0];
  if (index >= us.length) return ts[ts.length - 1];
  if (z == us[index]) return ts[index];
  // linear interpolation
  return (
    ts[index] - ((us[index] - value) / (us[index] - us[index - 1])) * (ts[index] - ts[index - 1])
  );
};

export default ppf;
