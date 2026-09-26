import {drawProgressBar} from 'console-toolkit/progress-bar';
import style from 'console-toolkit/style.js';

const dim = s => style.dim.text(s);

export const formatDuration = ms => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

/**
 * @param {{label: string, done: number, total: number, remainingMs?: number}} progress
 */
export const progressLine = ({label, done, total, remainingMs}) => {
  const fraction = total > 0 ? done / total : 0;
  return (
    drawProgressBar(fraction, 30, {fillStyle: style.bright.cyan, trackStyle: style.dim}) +
    ' ' +
    String(Math.floor(100 * fraction)).padStart(3) +
    '% ' +
    label +
    (typeof remainingMs == 'number'
      ? dim(
          remainingMs < 1000
            ? ' · less than a second left'
            : ` · about ${formatDuration(remainingMs)} left`
        )
      : '')
  );
};

export default progressLine;
