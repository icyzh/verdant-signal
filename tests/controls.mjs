import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

assert.match(source, /w: \[0, 24\].*a: \[24, 0\].*s: \[0, -24\].*d: \[-24, 0\]/);
assert.match(source, /e\.key === 'e'.*e\.key === 'E'/);
assert.doesNotMatch(source, /e\.key === 'w'.*e\.key === 'W'/);

console.log('controls: WASD pans and E watches');
