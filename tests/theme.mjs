import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeText } from '../theme.js';

assert.equal(themeText('A human farmer built a house in Propagate.'),
    'A colonist built a habitat in Verdant Signal.');
assert.equal(themeText('Orc farmers raid nearby towns.'), 'scavengers raid nearby colonies.');

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(index, /<title>Verdant Signal/);
assert.doesNotMatch(index, /content="Propagate"/);

const crt = readFileSync(new URL('../crt.js', import.meta.url), 'utf8');
assert.match(crt, /this\.mode = 'clean'/);

const pixel = readFileSync(new URL('../pixel.js', import.meta.url), 'utf8');
for (const renderer of ['makeXenoTree', 'makeXenoFlora', 'makeMineralCluster', 'makeColonyModule', 'makeXenoCritter'])
    assert.match(pixel, new RegExp(`export function ${renderer}\\b`));
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
assert.match(main, /VERDANT_RESKIN \? makeXenoTree/);
assert.match(main, /VERDANT_RESKIN \? \(colonyModules\[b\.kind\]/);
assert.match(main, /if \(VERDANT_RESKIN\) return false;/);
assert.match(main, /const MENU_HUMAN = \{ sheet: \{ culture: 'human', seed: 77,\s+colors:/,
    'start-menu fallback colonist has the palette its renderer requires');
assert.match(main, /ENTER THE SIGNAL/);
assert.match(main, /SELECT AN ORIGIN/);
assert.match(index, /github\.com\/icyzh/);

console.log('Verdant Signal vocabulary and full replacement renderers are wired.');
