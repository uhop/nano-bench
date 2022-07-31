import {normalCdf} from '../src/normal.js';
import normalPpf from '../src/normal-ppf.js';

console.log(normalCdf(18, 18, 6.245));
console.log(normalPpf(0.025, 18, 6.245));

console.log(normalCdf(0));
console.log(normalPpf(0.025));
