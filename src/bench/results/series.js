import {bootstrapSummary} from '../../stats.js';
import dipTest from '../../stats/dip.js';
import {mulberry32} from '../../utils/prng.js';
import {diffEnvironments} from './env-diff.js';

const baseName = file =>
  file
    .split(/[\\/]/)
    .pop()
    .replace(/\.json$/, '');

export const fileTag = ({file, results}) => results.label ?? baseName(file);

export const nameCounts = files => {
  const counts = {};
  for (const {results} of files) {
    for (const series of results.results) counts[series.name] = (counts[series.name] ?? 0) + 1;
  }
  return counts;
};

/**
 * @param {{file: string, results: any}[]} files
 * @param {{alpha: number}} options
 */
export const buildSeries = (files, {alpha}) => {
  const counts = nameCounts(files),
    series = [];
  for (const f of files) {
    const tag = fileTag(f),
      {seed, bootstrap} = f.results.params;
    f.results.results.forEach((s, j) => {
      // per-series stream: must match what the producing run displayed
      const random = mulberry32((seed + Math.imul(j, 0x9e3779b9)) >>> 0);
      series.push({
        label: counts[s.name] > 1 ? `${tag}/${s.name}` : s.name,
        tag,
        name: s.name,
        reps: s.reps,
        bodyHash: s.bodyHash,
        samples: s.samples,
        metrics: Array.isArray(s.metrics) ? s.metrics : null,
        metricsKind: f.results.params.metrics,
        summary: bootstrapSummary(s.samples, {alpha, bootstrap, random})
      });
    });
  }
  return series;
};

export const resultsWarnings = files => {
  const warnings = [];
  for (const {path, values} of diffEnvironments(files.map(f => f.results.environment))) {
    warnings.push(
      `environment differs — ${path}: ${values.map(v => JSON.stringify(v)).join(' vs ')}`
    );
  }
  for (const key of ['alpha', 'samples', 'bootstrap', 'correction']) {
    const values = files.map(f => f.results.params[key]);
    if (new Set(values).size > 1)
      warnings.push(`params.${key} differs across files: ${values.join(' vs ')}`);
  }
  const counts = nameCounts(files);
  for (const name of Object.keys(counts)) {
    if (counts[name] < 2) continue;
    const hashes = files.flatMap(f =>
      f.results.results.filter(s => s.name === name).map(s => s.bodyHash)
    );
    if (new Set(hashes).size > 1)
      warnings.push(`"${name}" body differs across runs — a measured delta may be code, not noise`);
  }
  return warnings;
};

export const multimodalityP = (sortedSamples, seed, j) =>
  dipTest(sortedSamples, {random: mulberry32((seed + Math.imul(j, 0x85ebca6b)) >>> 0)}).p;
