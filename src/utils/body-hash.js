import {createHash} from 'node:crypto';

export const bodyHash = fn => 'sha256:' + createHash('sha256').update(fn.toString()).digest('hex');

export default bodyHash;
