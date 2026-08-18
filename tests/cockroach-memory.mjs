// Structured CockroachDB rows must map back into the existing lineage and portal contracts.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const knowledge = require('../api/knowledge-graph.js');
const graph = require('../api/memory-graph.js');
const memory = require('../api/_memory-db.js');

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
ok(lineage?.name === 'Rivet Stone' && lineage.creed === 'Raise it together' && lineage.town === 'STARBLOOM'
    && lineage.townSeed === '42',
    'structured life maps to lineage without prose parsing');
ok(knowledge.toLineage({ payload: { life: { name: 'Creedless' } } }) === null, 'creedless life is not inheritable');

const repair = memory.localEmbedding('repair tools in the community workshop');
const related = memory.localEmbedding('the community shares tools for repair');
const unrelated = memory.localEmbedding('raiders crossed the frozen eastern wall');
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
ok(repair.length === 256 && repair.every(Number.isFinite), 'free local embedding is a valid VECTOR(256)');
ok(distance(repair, related) < distance(repair, unrelated), 'free local embedding ranks related text closer');
const oldProvider = process.env.MEMORY_EMBEDDING_PROVIDER, oldOff = process.env.MEMORY_EMBEDDINGS_OFF;
delete process.env.MEMORY_EMBEDDINGS_OFF;
process.env.MEMORY_EMBEDDING_PROVIDER = 'local';
ok((await memory.embed('repair')).length === 256, 'local provider selects the free embedder');
process.env.MEMORY_EMBEDDING_PROVIDER = 'off';
ok(await memory.embed('repair') === null, 'off provider disables embeddings');
process.env.MEMORY_EMBEDDING_PROVIDER = 'unknown';
let refusedUnknown = false;
try { await memory.embed('repair'); } catch { refusedUnknown = true; }
ok(refusedUnknown, 'unknown provider fails closed');
if (oldProvider === undefined) delete process.env.MEMORY_EMBEDDING_PROVIDER; else process.env.MEMORY_EMBEDDING_PROVIDER = oldProvider;
if (oldOff === undefined) delete process.env.MEMORY_EMBEDDINGS_OFF; else process.env.MEMORY_EMBEDDINGS_OFF = oldOff;

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
