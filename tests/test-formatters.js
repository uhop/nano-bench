import test from 'tape-six';

import {formatInteger, formatNumber, abbrNumber} from 'nano-bench/formatters.js';

test('formatters', t => {
  t.test('formatInteger()', t => {
    t.equal(formatInteger(1), '1');
    t.equal(formatInteger(12), '12');
    t.equal(formatInteger(123), '123');
    t.equal(formatInteger(1234), '1,234');
    t.equal(formatInteger(12345), '12,345');
    t.equal(formatInteger(123456), '123,456');
    t.equal(formatInteger(1234567), '1,234,567');
    t.equal(formatInteger(-1234567), '-1,234,567');
    t.equal(formatInteger(-1234567, {comma: ' '}), '-1 234 567');
  });

  t.test('formatNumber()', t => {
    // from formatInteger()
    t.equal(formatNumber(1), '1');
    t.equal(formatNumber(12), '12');
    t.equal(formatNumber(123), '123');
    t.equal(formatNumber(1234), '1,234');
    t.equal(formatNumber(12345), '12,345');
    t.equal(formatNumber(123456), '123,456');
    t.equal(formatNumber(1234567), '1,234,567');
    t.equal(formatNumber(-1234567), '-1,234,567');
    t.equal(formatNumber(-1234567, {comma: ' '}), '-1 234 567');

    t.equal(formatNumber(1234.5678, {decimals: 3}), '1,234.568');
    t.equal(formatNumber(1234.567, {decimals: 3}), '1,234.567');
    t.equal(formatNumber(1234.56, {decimals: 3}), '1,234.56');
    t.equal(formatNumber(1234.5, {decimals: 3}), '1,234.5');
    t.equal(formatNumber(1234.0, {decimals: 3}), '1,234');

    t.equal(formatNumber(1234.0, {decimals: 3, keepFractionAsIs: true}), '1,234.000');

    t.equal(formatNumber(1234.5678, {decimals: 3, comma: '.', dot: ','}), '1.234,568');
  });

  t.test('abbrNumber()', t => {
    // from formatInteger()
    t.equal(abbrNumber(1), '1');
    t.equal(abbrNumber(12), '12');
    t.equal(abbrNumber(123), '123');
    t.equal(abbrNumber(1234), '1,234');
    t.equal(abbrNumber(12345), '12k');
    t.equal(abbrNumber(123456), '123k');
    t.equal(abbrNumber(1234567), '1M');
    t.equal(abbrNumber(-1234567), '-1M');
    t.equal(abbrNumber(-1234567, {comma: ' '}), '-1M');

    t.equal(abbrNumber(1234.5678, {decimals: 3}), '1,234.568');
    t.equal(abbrNumber(1234.567, {decimals: 3}), '1,234.567');
    t.equal(abbrNumber(1234.56, {decimals: 3}), '1,234.56');
    t.equal(abbrNumber(1234.5, {decimals: 3}), '1,234.5');
    t.equal(abbrNumber(1234.0, {decimals: 3}), '1,234');

    t.equal(abbrNumber(1234.0, {decimals: 3, keepFractionAsIs: true}), '1,234.000');

    t.equal(abbrNumber(1234.5678, {decimals: 3, comma: '.', dot: ','}), '1.234,568');

    t.equal(abbrNumber(1234567.89, {decimals: 3}), '1.235M');
    t.equal(abbrNumber(1234567.8, {decimals: 3}), '1.235M');
    t.equal(abbrNumber(1234567.0, {decimals: 3}), '1.235M');
    t.equal(abbrNumber(1234560, {decimals: 3}), '1.235M');
    t.equal(abbrNumber(1234500, {decimals: 3}), '1.235M');
    t.equal(abbrNumber(1234000, {decimals: 3}), '1.234M');
    t.equal(abbrNumber(1230000, {decimals: 3}), '1.23M');
    t.equal(abbrNumber(1200000, {decimals: 3}), '1.2M');

    t.equal(abbrNumber(1200000, {decimals: 3, keepFractionAsIs: true}), '1.200M');
  });
});
