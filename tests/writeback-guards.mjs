// CockroachDB writeback contract with an in-memory adapter: origin/identity validation and durable-style
// conditional revisions, without a live cluster or Bedrock account.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const rows = new Map();
globalThis.__ryFarmsMemoryAdapter = {
    upsert: async row => {
        const key = `${row.ownerId}:${row.key}`, prior = rows.get(key);
        if (prior && row.revision <= prior.revision) return { written: false };
        rows.set(key, structuredClone(row));
        return { written: true };
    },
    embed: async () => null,
};
const handler = require('../api/memory-writeback.js');

let pass = true;
const ok = (condition, message) => { console.log((condition ? '  ✓ ' : '  ✗ FAIL ') + message); if (!condition) pass = false; };
const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function mock(body, headers = {}) {
    const req = { method: 'POST', headers, url: '/api/memory-writeback',
        on(event, cb) { if (event === 'data') cb(Buffer.from(JSON.stringify(body))); if (event === 'end') cb(); } };
    let payload;
    const responseHeaders = {};
    const res = { statusCode: 0, setHeader(k, v) { responseHeaders[k] = v; }, end(raw) { payload = JSON.parse(raw); } };
    return { req, res, out: () => ({ status: res.statusCode, payload, responseHeaders }) };
}

async function run(body, { owner = OWNER_A, origin, host = 'localhost:8000' } = {}) {
    const headers = { host, cookie: `ryf_owner=${owner}` };
    if (origin !== undefined) headers.origin = origin;
    const m = mock(body, headers);
    await handler(m.req, m.res);
    return m.out();
}

console.log('CockroachDB writeback guards');
{
    let result = await run({ townSeed: 5, farmers: [{ seed: 1, name: 'A' }] }, { origin: 'https://evil.example' });
    ok(result.status === 403 && rows.size === 0, 'cross-origin write rejected');

    result = await run({ townSeed: 5, rev: 7, farmers: [{ seed: 1, name: 'A', creeds: ['hold'] }] },
        { origin: 'http://localhost:8000' });
    ok(result.status === 200 && result.payload.persisted[0] === 1, 'same-origin write accepted');
    const first = rows.get(`${OWNER_A}:farmer:5:1`);
    ok(first?.revision === 7 && first.payload.life.name === 'A', 'structured life and revision stored');

    for (const bad of [null, false, true, '', ' ', [], {}, -1, 1.5, '01x']) {
        result = await run({ townSeed: bad, farmers: [{ seed: 2 }] });
        ok(result.status === 400, `invalid townSeed ${JSON.stringify(bad)} rejected`);
    }

    result = await run({ townSeed: 5, rev: 8, farmers: [{ seed: null }, { seed: 2, name: 'B' }] });
    ok(result.payload.persisted.length === 1 && result.payload.persisted[0] === 2, 'invalid farmer skipped without wildcard key');

    await run({ townSeed: 77, rev: 8, farmers: [{ seed: 3, name: 'new' }] });
    result = await run({ townSeed: 77, rev: 7, farmers: [{ seed: 3, name: 'stale' }] });
    ok(result.payload.persisted.length === 0 && rows.get(`${OWNER_A}:farmer:77:3`).payload.life.name === 'new', 'lower revision rejected');
    result = await run({ townSeed: 77, rev: 8, farmers: [{ seed: 3, name: 'equal' }] });
    ok(result.payload.persisted.length === 0 && rows.get(`${OWNER_A}:farmer:77:3`).payload.life.name === 'new', 'equal revision rejected');

    await Promise.all([
        run({ townSeed: 55, rev: 11, farmers: [{ seed: 1, name: 'v11' }] }),
        run({ townSeed: 55, rev: 10, farmers: [{ seed: 1, name: 'v10' }] }),
    ]);
    ok(rows.get(`${OWNER_A}:farmer:55:1`).revision === 11, 'concurrent writes retain the higher revision');

    await run({ townSeed: 5, rev: 7, farmers: [{ seed: 1, name: 'other owner' }] }, { owner: OWNER_B });
    ok(rows.get(`${OWNER_A}:farmer:5:1`).payload.life.name === 'A'
        && rows.get(`${OWNER_B}:farmer:5:1`).payload.life.name === 'other owner', 'owner namespaces cannot overwrite each other');

    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    result = await run({ townSeed: 9, farmers: [{ seed: 1 }] });
    ok(result.status === 403, 'production request without Origin rejected');
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;

    const malformed = mock({ townSeed: 12, farmers: [{ seed: 4, name: 'Cookie' }] },
        { host: 'localhost:8000', origin: 'http://localhost:8000', cookie: 'ryf_owner=%E0%A4%A' });
    await handler(malformed.req, malformed.res);
    result = malformed.out();
    ok(result.status === 200 && result.responseHeaders['Set-Cookie']?.startsWith('ryf_owner='),
        'malformed owner cookie is safely replaced');
}

delete globalThis.__ryFarmsMemoryAdapter;
console.log(pass ? '\nwriteback-guards: PASS' : '\nwriteback-guards: FAIL');
process.exit(pass ? 0 : 1);
