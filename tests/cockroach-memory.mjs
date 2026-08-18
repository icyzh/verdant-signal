// Structured CockroachDB rows must map back into the existing lineage and portal contracts.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const knowledge = require('../api/knowledge-graph.js');
const graph = require('../api/memory-graph.js');

let pass = true;
const ok = (condition, message) => { console.log((condition ? '  ✓ ' : '  ✗ FAIL ') + message); if (!condition) pass = false; };

const lifeRow = {
    owner_id: '11111111-1111-4111-8111-111111111111', memory_key: 'farmer:42:7', kind: 'farmer-life',
    town_seed: '42', farmer_seed: '7', embedded: true, content: 'Rivet remembers Truss stood with them.',
    payload: { town: 'STARBLOOM', life: { seed: 7, name: 'Rivet Stone', archetype: 'builder',
        creeds: ['Raise it together'], beliefs: ['Truss stood with Rivet'], episodic: ['Truss helped at the fence'],
        dream: 'a roof', sourceTitle: 'The first frost' } },
};

const lineage = knowledge.toLineage(lifeRow);
ok(lineage?.name === 'Rivet Stone' && lineage.creed === 'Raise it together' && lineage.town === 'STARBLOOM',
    'structured life maps to lineage without prose parsing');
ok(knowledge.toLineage({ payload: { life: { name: 'Creedless' } } }) === null, 'creedless life is not inheritable');

const towns = graph.shape([
    lifeRow,
    { ...lifeRow, memory_key: 'farmer:42:8', farmer_seed: '8', payload: { town: 'STARBLOOM',
        life: { seed: 8, name: 'Truss Ashfell', creeds: ['Hold'], beliefs: [], episodic: [] } } },
    { ...lifeRow, memory_key: 'town-history:42', kind: 'town-history', content: '', payload: { town: 'STARBLOOM',
        history: { manager: 'Rivet Stone', managerTerms: 2, watch: 'Truss Ashfell', history: [] } } },
    { ...lifeRow, memory_key: 'town-inventions:42', kind: 'town-inventions', content: '', payload: { town: 'STARBLOOM',
        inventions: { recipes: [{ name: 'Frost tea', inventor: 'Rivet' }] } } },
]);
ok(towns.length === 1 && towns[0].farmers.length === 2, 'portal groups structured lives into one town');
ok(towns[0].townHistory.includes('Rivet Stone') && towns[0].inventions[0].includes('Frost tea'), 'portal includes civic and invention memory');
ok(towns[0].links.some(link => link.label === 'stood by'), 'portal derives existing relationship labels');
ok(Array.isArray(graph.shape([{ ...lifeRow, payload: { life: { name: 'Broken', creeds: {} } } }])),
    'malformed stored arrays cannot break the portal');

console.log(pass ? '\ncockroach-memory: PASS' : '\ncockroach-memory: FAIL');
process.exit(pass ? 0 : 1);
