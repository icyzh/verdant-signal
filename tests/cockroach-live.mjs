// Optional live contract: DATABASE_URL=... node tests/cockroach-live.mjs
import pg from 'pg';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const memory = require('../api/_memory-db.js');

if (!process.env.DATABASE_URL) {
    console.log('cockroach-live: SKIP (DATABASE_URL unset)');
    process.exit(0);
}

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let pass = true;
const ok = (condition, message) => { console.log((condition ? '  ✓ ' : '  ✗ FAIL ') + message); if (!condition) pass = false; };
const row = revision => ({ ownerId, key: 'farmer:424242:1', kind: 'farmer-life', townSeed: 424242,
    farmerSeed: 1, revision, title: 'Probe', content: 'Probe holds the frost line',
    payload: { town: 'PROBE', life: { seed: 1, name: 'Probe', creeds: ['Hold the line'] } } });

try {
    await pool.query('DELETE FROM agent_memories WHERE owner_id = $1', [ownerId]);
    ok((await memory.upsert(row(2))).written, 'insert accepted');
    ok(!(await memory.upsert(row(1))).written, 'stale revision rejected by CockroachDB');
    const vector = Array(256).fill(0); vector[0] = 1;
    ok(!await memory.attachEmbedding(row(1), vector), 'stale embedding cannot attach to a newer revision');
    ok(await memory.attachEmbedding(row(2), vector), '256-dimensional vector attached conditionally');
    const graph = await memory.graphRows();
    ok(graph.some(r => r.memory_key === row(2).key && r.embedded), 'structured row and vector read back');
    const nearest = await pool.query(`SELECT memory_key FROM agent_memories
        WHERE kind = 'farmer-life' AND embedding IS NOT NULL
        ORDER BY embedding <-> $1::VECTOR LIMIT 1`, [`[${vector.join(',')}]`]);
    ok(nearest.rows[0]?.memory_key === row(2).key, 'nearest-neighbour query returns the stored life');
    const indexes = await pool.query('SHOW INDEXES FROM agent_memories');
    ok(indexes.rows.some(r => r.index_name === 'agent_memories_embedding_idx'), 'distributed vector index exists');
} finally {
    await pool.query('DELETE FROM agent_memories WHERE owner_id = $1', [ownerId]);
    await pool.end();
    if (globalThis.__ryFarmsCockroachPool) await globalThis.__ryFarmsCockroachPool.end();
}

console.log(pass ? '\ncockroach-live: PASS' : '\ncockroach-live: FAIL');
process.exit(pass ? 0 : 1);
