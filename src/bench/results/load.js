import {readFileSync} from 'node:fs';

import {parseResults} from './parse.js';

export {parseResults};

export const loadResults = filePath => parseResults(readFileSync(filePath, 'utf8'), filePath);

export default loadResults;
