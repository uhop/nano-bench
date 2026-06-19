import {compareDifference, formatInteger} from 'console-toolkit/alphanumeric/number-formatters.js';
import {infinity, multiplication} from 'console-toolkit/symbols.js';
import style, {c} from 'console-toolkit/style';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

const bold = s => style.bold.text(s),
  faster = s => style.bright.green.text(bold(s) + ' faster'),
  slower = s => style.bright.red.text(bold(s) + ' slower');

// 2-col width needs the emoji-regex dep
const rabbit = '\u{1f407}',
  turtle = '\u{1f422}';

export const writeSignificance = (
  writer,
  {testResult, matrix, stats, names, results, alpha, verbose, emoji = true}
) => {
  const isPair = results.length == 2;
  const methodName = isPair
      ? 'Mann–Whitney U test (two-sided, tie-corrected)'
      : 'Kruskal–Wallis H test',
    postHoc = isPair ? '' : '; post-hoc: Conover–Iman pairwise';
  writer.writeString(
    c`\n{{save.bold}}Significance:{{restore}} ${methodName}, α = {{save.bright.yellow}}${alpha}{{restore}}${postHoc}\n`
  );

  if (verbose) {
    const arrow = testResult.different ? 'reject H₀' : 'fail to reject H₀',
      rel = testResult.different ? '>' : '≤';
    if (isPair) {
      const z = testResult.value,
        zCrit = Math.abs(testResult.limit);
      writer.writeString(
        `  z = ${z.toFixed(2)}, |z| ${rel} z_crit = ${zCrit.toFixed(2)} → ${arrow}\n`
      );
    } else {
      const H = testResult.value,
        HCrit = testResult.limit;
      writer.writeString(
        `  H = ${H.toFixed(2)} ${rel} H_crit = ${HCrit.toFixed(2)} (β-approx) → ${arrow}\n`
      );
      if (testResult.C !== undefined) {
        const threshold = testResult.C * Math.sqrt(1 / results[0].length + 1 / results[1].length);
        writer.writeString(
          `  post-hoc threshold (Conover–Iman): C·√(1/nᵢ+1/nⱼ) = ${threshold.toFixed(2)} (C = ${testResult.C.toFixed(2)})\n`
        );
      }
    }
  }

  if (matrix) {
    const sortedStats = stats.slice().sort((a, b) => a.median - b.median),
      tableData = /** @type {any[]} */ ([[null, bold('#'), bold('name')]]);
    for (let i = 0; i < names.length; ++i) {
      tableData[0].push({value: bold(formatInteger(i + 1)), align: 'c'});
      const row = /** @type {any[]} */ ([null, formatInteger(i + 1), bold(names[i])]),
        signRow = matrix[i];
      for (let j = 0; j < signRow.length; ++j) {
        if (signRow[j]) {
          const result = compareDifference(stats[i].median, stats[j].median);
          let text = '';
          if (result.infinity) {
            text = infinity;
          } else if (result.percentage) {
            text = result.percentage + '%';
          } else if (result.ratio) {
            text = result.ratio + multiplication;
          }
          if (text) {
            text = result.less ? faster(text) : slower(text);
            row.push({value: text, align: 'c'});
          } else {
            row.push(null);
          }
        } else {
          row.push(null);
        }
      }
      if (stats[i] === sortedStats[0]) {
        row[0] = {value: emoji ? rabbit : 'F', align: 'c'};
      } else if (stats[i] === sortedStats[sortedStats.length - 1]) {
        row[0] = {value: emoji ? turtle : 'S', align: 'c'};
      }
      tableData.push(row);
    }
    const table = makeTable(tableData, lineTheme);
    table.vAxis[1] = 2;
    writer.writeString(
      c`{{save.bright.cyan.bold}}The difference is statistically significant:{{restore}}\n\n`
    );
    writer.write(table.toStrings());
  } else {
    writer.writeString('The difference is not statistically significant.\n');
  }
};
