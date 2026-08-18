// The founding-time read half of the CockroachDB memory loop. It returns remembered lives in the
// lineage shape dna.js already consumes; the simulation compiles these once and never queries mid-tick.
const memory = require('./_memory-db.js');

function send(res, payload) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(payload));
}

const numOrNull = v => {
    if (typeof v === 'string' && /^\d+$/.test(v)) { const n = Number(v); return Number.isSafeInteger(n) ? n : null; }
    return null;
};

function toLineage(row) {
    const doc = row?.payload || {};
    const life = doc.life || {};
    const creed = Array.isArray(life.creeds) && life.creeds.find(Boolean);
    if (!life.name || !creed) return null;
    return {
        id: String(row.memory_key),
        farmerSeed: life.seed == null ? null : String(life.seed),
        townSeed: row.town_seed == null ? null : String(row.town_seed),
        name: String(life.name),
        archetype: String(life.archetype || 'farmer'),
        town: doc.town == null ? null : String(doc.town),
        creed: String(creed),
        dream: life.dream == null ? null : String(life.dream),
        sourceTitle: life.sourceTitle == null ? null : String(life.sourceTitle),
    };
}

module.exports = async function handler(req, res) {
    try {
        const url = new URL(req.url || '/api/knowledge-graph', 'http://localhost');
        const townSeed = numOrNull(url.searchParams.get('seed')) ?? 0;
        const query = String(url.searchParams.get('q') || 'farmer creed belief dream founders help remembers course').slice(0, 500);
        const owner = memory.ownerId(req, res);
        const rows = await memory.lineage(owner, townSeed, query);
        if (!rows) return send(res, { documents: [], lineage: [], source: 'error', count: 0, lineageCount: 0,
            error: 'cockroachdb not configured' });
        const lineage = rows.map(toLineage).filter(Boolean);
        return send(res, { documents: [], lineage, source: lineage.length ? 'cockroachdb' : 'empty',
            count: 0, lineageCount: lineage.length });
    } catch (error) {
        return send(res, { documents: [], lineage: [], source: 'error', count: 0, lineageCount: 0,
            error: error?.message || 'memory fetch failed' });
    }
};

module.exports.toLineage = toLineage;
