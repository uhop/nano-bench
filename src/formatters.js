const units = ['s', 'ms', 'μs', 'ns', 'ps'];

export const prepareTimeFormat = (data, scale = 1) => {
  let mx = -1000,
    mn = 1000;
  for (let i = 0; i < data.length; ++i) {
    const p = Math.floor(Math.log(data[i] / scale) / Math.LN10);
    if (isFinite(p)) {
      if (mx < p) {
        mx = p;
      }
      if (mn > p) {
        mn = p;
      }
    }
  }
  if (mx < mn) {
    mn = mx = -6;
  }
  const digits = Math.max(mx - mn + 1, 2);
  scale = 1 / scale;
  // TODO: get rid of the loop below
  let i = 0;
  for (; mx < 0 && i < units.length - 1; ++i, mx += 3, scale *= 1000);
  return {scale, precision: digits - mx, unit: units[i]};
};

export const formatTime = (value, format) => {
  let result = (value * format.scale).toFixed(format.precision);
  if (format.precision > 0) {
    result = result.replace(/\.0+$/, '');
  }
  return result + format.unit;
};

const putCommasIn = s => {
  if (s.length < 4) return s;
  const r = s.length % 3;
  return (
    (r ? s.slice(0, r) + ',' : '') +
    s
      .slice(r)
      .replace(/(\d{3})/g, '$1,')
      .slice(0, -1)
  );
};

export const formatNumber = n => (isNaN(n) ? '' : putCommasIn(n.toFixed(0)));

const exp = [0, 0, 0, 0, 3, 3, 6, 6, 6, 9, 9, 9, 12];
const abbr = '***k**M**G**T';

export const abbrNumber = (n, decimals = 0) => {
  if (isNaN(n)) return '';
  if (n <= 1) {
    let t1 = n.toString(),
      t2 = n.toFixed(decimals);
    return t1.length < t2.length ? t1 : t2;
  }
  const digits = Math.min(Math.floor(Math.log(n) / Math.LN10), exp.length - 1),
    e = exp[digits],
    s = Math.round(n / Math.pow(10, e - decimals)).toFixed(0);
  if (!decimals) return putCommasIn(s) + ((e && abbr.charAt(e)) || '');
  return (
    putCommasIn(s.slice(0, -decimals)) + '.' + s.slice(-decimals) + ((e && abbr.charAt(e)) || '')
  );
};
