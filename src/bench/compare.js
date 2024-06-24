import {measure, measurePar} from './runner.js';
import kwtest from '../significance/kwtest.js';
import mwtest from '../significance/mwtest.js';

const ALPHA = 0.05;

const compare = async (inputs, options = {}, report) => {
  const keys = Object.keys(inputs);
  if (keys.length < 2) throw new Error('The "inputs" is supposed to have 2 or more samples.');

  options = Object.assign({alpha: ALPHA}, options);
  const measureFn = options.usePar ? measurePar : measure;

  const stats = new Array(keys.length);
  for (let i = 0; i < keys.length; ++i) {
    stats[i] = await measureFn(inputs[keys[i]], options, report);
    stats[i].ensureSorted();
  }
  const reps = stats.map(stat => stat.reps);
  stats.forEach(stat => stat.normalizeReps());

  report?.('calculating-significance', {stats, options});
  let results;
  if (keys.length > 2) {
    results = kwtest(stats.map(stat => stat.data), options.alpha);
  } else {
    results = mwtest(stats[0].data, stats[1].data, options.alpha);
  }
  results.data = stats.map(stat => stat.data);
  results.reps = reps;
  report?.('significance-results', results);
  return results;
};

export default compare;
