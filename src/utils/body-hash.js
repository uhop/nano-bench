import {createHash} from 'node:crypto';

export const textHash = text => 'sha256:' + createHash('sha256').update(text).digest('hex');

export const bodyHash = fn => textHash(fn.toString());

export default bodyHash;
