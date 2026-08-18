// api/memory-writeback.js — persist each farmer's COMPILED inner life in CockroachDB.
//
// The other half of the memory loop. api/knowledge-graph.js READS the source corpus once at founding
// to grow the cast; this endpoint WRITES each farmer's distilled life — the creeds inherited from their
// source document, the beliefs they've earned, and a few recent episodic memories — back as a document,
// so a farmer's remembered life persists and travels beyond a single save.
//
// Doctrine: this is a pure SIDE-CHANNEL, off the sim loop. Best-effort: a database or embedding failure
// never blocks the game, whose browser store commits first. CockroachDB's conditional upsert is the durable
// revision guard; no process-local ordering state is needed.

const memory = require('./_memory-db.js');
const MAX_FARMERS = 64;   // a town is small; cap defensively against a malformed body

function send(res, status, payload) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = status;
    res.end(JSON.stringify(payload));
}

function isSameOrigin(req) {
    const origin = req?.headers?.origin;
    if (!origin) return process.env.NODE_ENV !== 'production';
    try { return new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); }
    catch { return false; }
}
// #Codex25-7: a STRICT non-negative-integer parse. `+v` coerces null/''/[]/false all to 0 and true to 1, so
// the old `Number.isFinite(+v)` accepted them and let a caller write the shared `ry-farms:0:0` doc. Accept only
// a real non-negative safe integer, or a canonical non-negative integer string — nothing else.
const numOrNull = v => {
    if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : null;
    if (typeof v === 'string' && /^\d+$/.test(v)) { const n = Number(v); return Number.isSafeInteger(n) ? n : null; }
    return null;
};

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', c => { raw += c; if (raw.length > 512 * 1024) { reject(new Error('body too large')); req.destroy(); } });
        req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('bad json')); } });
        req.on('error', reject);
    });
}

// Compose the town's CIVIC RECORD (#94 P3) — who has led, for how long, and how each term ended — as a
// single town-level document so the town's political memory persists alongside the lives.
function townHistoryDoc(th, town) {
    const lines = [`${town || 'The valley'} — the civic record.`];
    if (th.manager) lines.push(`Manager: ${th.manager}${th.managerTerms ? ` (serving, ${th.managerTerms} year${th.managerTerms > 1 ? 's' : ''})` : ''}.`);
    if (th.watch) lines.push(`Town Watch: ${th.watch}.`);
    const past = Array.isArray(th.history) ? th.history : [];
    if (past.length) {
        lines.push('Past office-holders the town remembers:');
        for (const h of past.slice(-24)) {
            const office = h.office === 'manager' ? 'Manager' : 'Watch';
            const span = h.fromYear === h.toYear ? `Year ${h.fromYear}` : `Years ${h.fromYear}-${h.toYear}`;
            lines.push(` - ${office} ${String(h.name || '?').split(' ')[0]}: ${span}, ${h.endReason}${h.why ? ` (${h.why})` : ''}.`);
        }
    }
    // #134 THE LEARNING ARC — the town's raid memory + the response it learned, persisted so its hard-won wisdom
    // outlives the save (and can seed a later town / be surfaced in the memory portal).
    if (th.raidsSuffered > 0) {
        lines.push(`Raids weathered: ${th.raidsSuffered}.`);
        if (th.learned === 'defense') lines.push('What the town learned from being raided: to make itself too costly to raid — it holds the wall and keeps a hard watch.');
        else if (th.learned === 'truce') lines.push('What the town learned from being raided: it grew weary of the bloodshed and resolved to seek a truce at the frontier, not another fight.');
    }
    // #nemesis THE BOOK OF WARS — the town's named-foe arcs, current and ended: who kept coming back, whom he
    // swore against, and how each war finished. This is the continuity CockroachDB exists to hold.
    const wars = th.wars || {};
    const endWord = o => o === 'fell' ? 'ended with the warleader and his whole band broken on the line'
                       : o === 'peace' ? 'ended at the parley table' : 'ended';
    if (wars.current && !wars.current.ended) {
        const c = wars.current;
        lines.push(`The war now upon the town: ${c.name} has raided ${c.raidCount} time${c.raidCount > 1 ? 's' : ''} and is not done.` +
                   (c.sworeAgainst ? ` He has sworn against ${c.sworeAgainst} — everyone knows he is coming for them.` : ''));
    }
    const pastWars = Array.isArray(wars.past) ? wars.past : [];
    if (pastWars.length) {
        lines.push('Wars the town has survived:');
        for (const p of pastWars.slice(-8)) {
            lines.push(` - The war of ${p.name}: ${p.raidCount} raid${p.raidCount > 1 ? 's' : ''}, ${endWord(p.outcome)} in year ${p.year}.` +
                       (p.sworeAgainst ? ` His sworn enemy was ${p.sworeAgainst}.` : ''));
        }
    }
    return lines.join('\n');
}

// #nemesis THE BATTLE RECORD — one document per real raid battle: the header (whose war, which raid), the
// round-by-round exchanges as they showed on screen, and the honest ledger of the outcome. These are the
// memories the hackathon loop exists to close: a town grown FROM memories writing its battles BACK as ones.
function battleDoc(b, town) {
    const lines = [];
    const where = town || 'the town';
    const NTHW = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const nth = n => NTHW[Math.min(Math.max(1, n | 0), NTHW.length) - 1];
    if (b.nemesis && b.nemesis.name) lines.push(`The battle of day ${b.day}, year ${b.year} — ${b.nemesis.name}'s raid (the ${nth(b.nemesis.raidCount || 1)} of his war) on ${where}.`);
    else lines.push(`The battle of day ${b.day}, year ${b.year} — ${b.clan || 'a warband'} against ${where}.`);
    const rounds = Array.isArray(b.rounds) ? b.rounds.slice(0, 48) : [];
    if (rounds.length) {
        lines.push('How it went, blow by blow:');
        rounds.forEach((r, k) => lines.push(` ${k + 1}. ${r.who ? r.who + ' - ' : ''}${String(r.text || '').replace(/!+$/, '')}`));
    }
    const o = b.outcome || {};
    const closing = [];
    if (o.felled > 0) closing.push(`${o.felled} of ${o.n || '?'} raiders fell at the line`);
    if (o.n != null && o.felled != null && o.felled < o.n) closing.push(`${o.n - o.felled} broke off and fled`);
    if (o.harvestLost > 0) closing.push(`${o.harvestLost} measures of the harvest were carried away`);
    else closing.push('the stores were held');
    if (closing.length) lines.push(`The reckoning: ${closing.join('; ')}.`);
    if (b.hero) lines.push(`${b.hero} held the line — the town will remember.`);
    if (Array.isArray(b.wounded) && b.wounded.length) lines.push(`Wounded holding it: ${b.wounded.join(', ')}.`);
    return lines.join('\n');
}

// #97 P5 — the town's book of INVENTIONS: each generatively-discovered recipe, its ingredients, and who
// first worked it out — one town-level document (sibling of the civic record).
function townInventionsDoc(ti, town) {
    const lines = [`${town || 'The valley'} — the book of inventions.`];
    const recipes = Array.isArray(ti.recipes) ? ti.recipes : [];
    if (recipes.length) {
        lines.push('Recipes the town has invented:');
        for (const r of recipes.slice(-40)) {
            const ing = Array.isArray(r.ingredients) ? r.ingredients.join(' + ') : '';
            const who = r.inventor ? `, first worked out by ${String(r.inventor).split(' ')[0]}` : '';
            lines.push(` - ${r.name} (from ${ing})${who}${r.lore ? `: ${r.lore}` : ''}.`);
        }
    }
    return lines.join('\n');
}

// Compose a readable "remembered life" from the compiled objects the client sends.
function lifeDoc(f, town) {
    const lines = [`${f.name || 'A settler'} — a ${f.archetype || 'farmer'} of ${town || 'the valley'}.`];
    if (f.sourceTitle) lines.push(`Grown from the memory: "${String(f.sourceTitle).slice(0, 120)}".`);
    if (f.dream) lines.push(`Their dream: ${f.dream}.`);
    if (Array.isArray(f.creeds) && f.creeds.length) { lines.push('Creeds they live by:'); for (const c of f.creeds.slice(0, 6)) lines.push(` - ${c}`); }
    if (Array.isArray(f.beliefs) && f.beliefs.length) { lines.push('Beliefs they have earned:'); for (const b of f.beliefs.slice(0, 8)) lines.push(` - ${b}`); }
    if (Array.isArray(f.episodic) && f.episodic.length) { lines.push('Recent memories:'); for (const e of f.episodic.slice(0, 12)) lines.push(` - ${e}`); }
    return lines.join('\n');
}

async function writeRow(row) {
    const out = await memory.upsert(row);
    if (out?.error) { console.error(`[writeback] ${row.kind} failed`, out.error?.message || out.error); return { written: false, embedded: false }; }
    if (!out?.written) return { written: false, embedded: false };
    try {
        const vector = await memory.embed(row.content);
        return { written: true, embedded: vector ? await memory.attachEmbedding(row, vector) : false };
    } catch (error) {
        console.warn(`[writeback] ${row.kind} embedding failed`, error?.message || error);
        return { written: true, embedded: false };
    }
}

async function writeRows(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i += 8) out.push(...await Promise.all(rows.slice(i, i + 8).map(writeRow)));
    return out;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });
    if (!isSameOrigin(req)) return send(res, 403, { ok: false, error: 'cross-origin writes are not allowed' });

    let body;
    try { body = await readBody(req); } catch (e) { return send(res, 200, { ok: false, written: 0, error: e?.message || 'bad body' }); }
    const townSeed = numOrNull(body?.townSeed);
    if (townSeed == null) return send(res, 400, { ok: false, written: 0, error: 'numeric townSeed required' });
    const rev = numOrNull(body?.rev) ?? 0;
    const farmers = Array.isArray(body?.farmers) ? body.farmers.slice(0, MAX_FARMERS) : [];
    const townHistory = body?.townHistory && typeof body.townHistory === 'object' ? body.townHistory : null;
    const townInventions = body?.townInventions && typeof body.townInventions === 'object' ? body.townInventions : null;
    const battle = body?.battle && typeof body.battle === 'object' && body.battle.rid ? body.battle : null;
    if (!farmers.length && !townHistory && !townInventions && !battle) return send(res, 200, { ok: true, written: 0 });

    const ownerId = memory.ownerId(req, res);
    const town = body.town == null ? null : String(body.town).slice(0, 120);
    const rows = [];
    if (townHistory) rows.push({ ownerId, key: `town-history:${townSeed}`, kind: 'town-history', townSeed,
        farmerSeed: null, revision: rev, title: `${town || 'The valley'} civic record`,
        content: townHistoryDoc(townHistory, town), payload: { town, history: townHistory }, flag: 'townHistory' });
    if (townInventions) rows.push({ ownerId, key: `town-inventions:${townSeed}`, kind: 'town-inventions', townSeed,
        farmerSeed: null, revision: rev, title: `${town || 'The valley'} inventions`,
        content: townInventionsDoc(townInventions, town), payload: { town, inventions: townInventions }, flag: 'townInventions' });
    if (battle) {
        const rid = String(battle.rid).replace(/[^\w:.-]/g, '_').slice(0, 80);
        rows.push({ ownerId, key: `battle:${townSeed}:${rid}`, kind: 'battle', townSeed, farmerSeed: null,
            revision: rev, title: `${town || 'The valley'} battle`, content: battleDoc(battle, town),
            payload: { town, battle }, flag: 'battle' });
    }
    for (const f of farmers) {
        const farmerSeed = numOrNull(f?.seed);
        if (farmerSeed == null) continue;
        rows.push({ ownerId, key: `farmer:${townSeed}:${farmerSeed}`, kind: 'farmer-life', townSeed, farmerSeed,
            revision: rev, title: String(f.name || 'A settler').slice(0, 160), content: lifeDoc(f, town),
            payload: { town, life: f }, flag: 'farmer' });
    }

    const results = await writeRows(rows);
    const landed = i => !!results[i]?.written;
    const persisted = rows.flatMap((r, i) => r.flag === 'farmer' && landed(i) ? [r.farmerSeed] : []);
    const townHistoryWritten = rows.some((r, i) => r.flag === 'townHistory' && landed(i));
    const townInventionsWritten = rows.some((r, i) => r.flag === 'townInventions' && landed(i));
    const battleWritten = rows.some((r, i) => r.flag === 'battle' && landed(i));
    return send(res, 200, { ok: true, written: results.filter(r => r.written).length, of: farmers.length,
        persisted, townHistoryWritten, townInventionsWritten, battleWritten,
        embedded: results.filter(r => r.embedded).length, source: 'cockroachdb' });
};
