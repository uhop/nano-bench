import {measure} from './runner.js';
import kwtest from './kwtest.js';
import mwtest from './mwtest.js';

const ALPHA = 0.05;

const compare = async (inputs, options = {}) => {
  const keys = Object.keys(inputs);
  if (keys.length < 2) throw new Error('The "inputs" is supposed to have 2 or more samples.');

  options = Object.assign({alpha: ALPHA}, options);

  const stats = new Array(keys.length);
  for (let i = 0; i < keys.length; ++i) {
    stats[i] = await measure(inputs[keys[i]], options);
    stats[i].ensureSorted();
  }
  const reps = stats.map(stat => stat.reps);
  stats.forEach(stat => stat.normalizeReps());

  let results;
  if (keys.length > 2) {
    results = kwtest(stats.map(stat => stat.data), options.alpha);
  } else {
    results = mwtest(stats[0].data, stats[1].data, options.alpha);
  }
  results.data = stats.map(stat => stat.data);
  results.reps = reps;
  return results;
};

export default compare;
