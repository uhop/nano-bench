import {bootstrapSummary, getWeightedValue} from '../../stats.js';
import {numericAsc} from '../../utils/numeric-asc.js';
import dipTest from '../../stats/dip.js';
import {mulberry32} from '../../utils/prng.js';
import {diffEnvironments} from './env-diff.js';
import {contentionWarning, isContended} from '../contention.js';

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
        processSizes: Array.isArray(s.processSizes) ? s.processSizes : null,
        phaseSizes: Array.isArray(s.phaseSizes) ? s.phaseSizes : null,
        // `-p N` stores N; files before it store `true`, a single burst with no rounds
        roundSize: typeof f.results.params.parallel == 'number' ? f.results.params.parallel : null,
        metricsKind: f.results.params.metrics,
        summary: bootstrapSummary(s.samples, {alpha, bootstrap, random})
      });
    });
  }
  return series;
};

const median = samples => getWeightedValue(samples.slice().sort(numericAsc), 0.5);

const splitBySizes = (s, sizes) => {
  const parts = [];
  let start = 0;
  for (const size of sizes) {
    parts.push(s.samples.slice(start, start + size));
    start += size;
  }
  return parts;
};

const splitRounds = s => {
  const parts = [];
  for (let start = 0; start < s.samples.length; start += s.roundSize)
    parts.push(s.samples.slice(start, start + s.roundSize));
  return parts;
};

/**
 * What a significance test compares: per-process medians when every series was measured in
 * more than one process (`nano-bench --isolate --repeat N`), per-round medians when every series
 * ran in rounds of concurrent calls (`nano-bench -p N`), per-phase medians when every series
 * ran in more than one load phase (`nano-bench-io --in-flight` or `--rate`), the samples otherwise.
 * @param {{samples: number[], processSizes?: number[] | null, phaseSizes?: number[] | null, roundSize?: number | null}[]} members
 * @returns {{arrays: number[][], unit: 'samples' | 'process-medians' | 'round-medians' | 'phase-medians'}}
 */
export const comparisonArrays = members => {
  if (members.every(s => s.processSizes && s.processSizes.length > 1))
    return {
      arrays: members.map(s => splitBySizes(s, s.processSizes).map(median)),
      unit: 'process-medians'
    };
  if (members.every(s => s.phaseSizes && s.phaseSizes.length > 1))
    return {
      arrays: members.map(s => splitBySizes(s, s.phaseSizes).map(median)),
      unit: 'phase-medians'
    };
  if (members.every(s => s.roundSize > 1))
    return {arrays: members.map(s => splitRounds(s).map(median)), unit: 'round-medians'};
  return {arrays: members.map(s => s.samples), unit: 'samples'};
};

/**
 * The warning for a browser run whose page was not cross-origin isolated, or null.
 * @param {{crossOriginIsolated?: boolean, timerResolutionMs?: number} | undefined} browser
 * @param {number} ms the sample length
 */
export const isolationWarning = (browser, ms) => {
  if (!browser || browser.crossOriginIsolated !== false) return null;
  const step = +(browser.timerResolutionMs ?? NaN).toPrecision(3),
    share =
      step > 0 && ms > 0 ? ` (up to ${+((100 * step) / ms).toFixed(1)}% of a ${ms} ms sample)` : '';
  return `the page was not cross-origin isolated, so the timer stepped ${step} ms${share}: isolation needs HTTPS or localhost (an SSH tunnel works) and a browser that grants it`;
};

export const resultsWarnings = files => {
  const warnings = [],
    many = files.length > 1;
  for (const f of files) {
    for (const s of f.results.results) {
      if (isContended(s.contention))
        warnings.push(
          `${many ? fileTag(f) + '/' : ''}${s.name}: ${contentionWarning(s.contention)}`
        );
    }
    const isolation = isolationWarning(f.results.environment?.browser, f.results.params?.ms);
    if (isolation) warnings.push(many ? `${fileTag(f)}: ${isolation}` : isolation);
  }
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
