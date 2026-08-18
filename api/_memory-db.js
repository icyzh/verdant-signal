// CockroachDB is the durable memory side-channel. The simulation never reads it mid-tick.
const { randomUUID } = require('node:crypto');

const COOKIE = 'ryf_owner';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VECTOR_DIMS = 256;

function testAdapter() { return globalThis.__ryFarmsMemoryAdapter || null; }

function pool() {
    if (!process.env.DATABASE_URL) return null;
    if (!globalThis.__ryFarmsCockroachPool) {
        const { Pool } = require('pg');
        globalThis.__ryFarmsCockroachPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: Number(process.env.MEMORY_DB_POOL_SIZE) || 5,
            application_name: 'verdant-signal-memory',
        });
    }
    return globalThis.__ryFarmsCockroachPool;
}

function ownerId(req, res) {
    const raw = String(req?.headers?.cookie || '').split(';').map(s => s.trim());
    const found = raw.find(s => s.startsWith(COOKIE + '='));
    let value = '';
    try { value = found ? decodeURIComponent(found.slice(COOKIE.length + 1)) : ''; } catch {}
    if (UUID.test(value || '')) return value;
    const id = randomUUID();
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
    return id;
}

function vectorLiteral(v) {
    if (!Array.isArray(v) || v.length !== VECTOR_DIMS || v.some(n => !Number.isFinite(n))) return null;
    return `[${v.join(',')}]`;
}

async function embed(text) {
    const fake = testAdapter();
    if (fake?.embed) return fake.embed(text);
    if (!process.env.AWS_REGION || process.env.MEMORY_EMBEDDINGS_OFF === '1') return null;
    const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
    const client = globalThis.__ryFarmsBedrock ||= new BedrockRuntimeClient({ region: process.env.AWS_REGION });
    const out = await client.send(new InvokeModelCommand({
        modelId: process.env.MEMORY_EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0',
        contentType: 'application/json', accept: 'application/json',
        body: JSON.stringify({ inputText: String(text).slice(0, 16000), dimensions: VECTOR_DIMS, normalize: true }),
    }));
    return JSON.parse(Buffer.from(out.body).toString()).embedding || null;
}

async function upsert(row) {
    const fake = testAdapter();
    if (fake?.upsert) return fake.upsert(row);
    const db = pool();
    if (!db) return { offline: true };
    const q = `
        INSERT INTO agent_memories
            (owner_id, memory_key, kind, town_seed, farmer_seed, revision, title, content, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB)
        ON CONFLICT (owner_id, memory_key) DO UPDATE SET
            kind = excluded.kind,
            town_seed = excluded.town_seed,
            farmer_seed = excluded.farmer_seed,
            revision = excluded.revision,
            title = excluded.title,
            content = excluded.content,
            payload = excluded.payload,
            embedding = NULL,
            updated_at = now()
        WHERE excluded.revision > agent_memories.revision
        RETURNING memory_key, revision`;
    try {
        const out = await db.query(q, [row.ownerId, row.key, row.kind, row.townSeed, row.farmerSeed,
            row.revision, row.title, row.content, JSON.stringify(row.payload)]);
        return { written: !!out.rowCount };
    } catch (error) { return { error }; }
}

async function attachEmbedding(row, vector) {
    const literal = vectorLiteral(vector);
    if (!literal) return false;
    const fake = testAdapter();
    if (fake?.attachEmbedding) return fake.attachEmbedding(row, vector);
    const db = pool();
    if (!db) return false;
    const out = await db.query(`UPDATE agent_memories SET embedding = $1::VECTOR, updated_at = now()
        WHERE owner_id = $2 AND memory_key = $3 AND revision = $4`,
        [literal, row.ownerId, row.key, row.revision]);
    return out.rowCount === 1;
}

async function lineage(owner, townSeed, query) {
    const fake = testAdapter();
    if (fake?.lineage) return fake.lineage(owner, townSeed, query);
    const db = pool();
    if (!db) return null;
    let vector = null;
    try { vector = vectorLiteral(await embed(query)); } catch (error) { console.warn('[memory] query embedding failed:', error?.message || error); }
    const sql = vector
        ? `SELECT memory_key, payload FROM agent_memories
           WHERE kind = 'farmer-life' AND embedding IS NOT NULL
             AND NOT (owner_id = $2 AND town_seed = $3)
           ORDER BY embedding <-> $1::VECTOR LIMIT 100`
        : `SELECT memory_key, payload FROM agent_memories
           WHERE kind = 'farmer-life' AND NOT (owner_id = $1 AND town_seed = $2)
           ORDER BY updated_at DESC, memory_key LIMIT 100`;
    const args = vector ? [vector, owner, townSeed] : [owner, townSeed];
    return (await db.query(sql, args)).rows;
}

async function graphRows() {
    const fake = testAdapter();
    if (fake?.graphRows) return fake.graphRows();
    const db = pool();
    if (!db) return null;
    return (await db.query(`SELECT owner_id, memory_key, kind, town_seed, farmer_seed, content, payload,
            embedding IS NOT NULL AS embedded
        FROM agent_memories ORDER BY updated_at DESC LIMIT 2000`)).rows;
}

module.exports = { ownerId, embed, upsert, attachEmbedding, lineage, graphRows, VECTOR_DIMS };
