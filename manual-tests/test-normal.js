import {normalCdf} from 'nano-benchmark/stats/normal.js';
import normalPpf from 'nano-benchmark/stats/normal-ppf.js';

console.log(normalCdf(18, 18, 6.245));
console.log(normalPpf(0.025, 18, 6.245));

console.log(normalCdf(0));
console.log(normalPpf(0.025));
