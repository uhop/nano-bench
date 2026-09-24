import {fullBlock, hBlocks8th, shadeLight} from 'console-toolkit/symbols.js';
import style from 'console-toolkit/style.js';

const bar = s => style.bright.cyan.text(s),
  dim = s => style.dim.text(s);

export const progressBar = (fraction, width = 30) => {
  const cells = Math.min(1, Math.max(0, fraction)) * width,
    whole = Math.floor(cells),
    eighths = Math.round((cells - whole) * 8),
    partial = whole < width && eighths ? hBlocks8th[eighths] : '',
    filled = fullBlock.repeat(whole) + partial;
  return bar(filled) + dim(shadeLight.repeat(width - whole - (partial ? 1 : 0)));
};

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
    progressBar(fraction) +
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
