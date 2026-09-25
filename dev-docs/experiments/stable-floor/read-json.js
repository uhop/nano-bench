// A real I/O population: read and parse this repository's package-lock.json.
import {readFile} from 'node:fs/promises';

const file = new URL('../../../package-lock.json', import.meta.url);

export default {
  readJson: async n => {
    for (let i = 0; i < n; ++i) JSON.parse(await readFile(file, 'utf8'));
  }
};
