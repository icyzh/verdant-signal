// Read-only CockroachDB-backed memory portal. Rows stay structured in SQL; no semantic-search fan-out or
// prose re-parsing is needed to reconstruct the town graph.
const memory = require('./_memory-db.js');

const RELS = [
    [/nursed|healed|tended|soup|back to health/i, 'nursed'],
    [/shortchang|lowball|cheat|hard bargain|robbed/i, 'chiselled'],
    [/stole|thiev|poach|blight|harm|poison/i, 'wronged'],
    [/taught|showed .* how|shown how/i, 'taught'],
    [/traded|barter|swap/i, 'traded'],
    [/stood with|pulled .* back|helped|lent .* a hand|dug .* well/i, 'stood by'],
    [/fell out|grudge|resent|turned .* away|refused to heal/i, 'fell out with'],
    [/grown close|bond|beloved/i, 'close to'],
];

function send(res, payload) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(payload));
}

function historyText(h) {
    if (!h) return null;
    const lines = [];
    for (const t of Array.isArray(h.history) ? h.history : []) lines.push(`${t.name} held the ${t.office} office, year ${t.fromYear}${t.toYear != null ? `-${t.toYear}` : ' on'}${t.endReason ? ` (${t.endReason})` : ''}.`);
    if (h.manager) lines.push(`${h.manager} manages the town${h.managerTerms > 1 ? ` (term ${h.managerTerms})` : ''}; ${h.watch || 'no one'} keeps the watch.`);
    if (h.raidsSuffered) lines.push(`The town has weathered ${h.raidsSuffered} raid${h.raidsSuffered === 1 ? '' : 's'}${h.learned ? ` — and learned: ${h.learned}` : ''}.`);
    const wars = h.wars || {};
    if (wars.current) lines.push(`${wars.current.name} wars upon the town — ${wars.current.raidCount} raid${wars.current.raidCount === 1 ? '' : 's'}${wars.current.ended ? ' (ended)' : ''}.`);
    for (const p of Array.isArray(wars.past) ? wars.past : []) lines.push(`The war of ${p.name} ended: ${p.outcome || 'faded'} (year ${p.year}).`);
    return lines.length ? lines.join('\n') : null;
}

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function shape(rows) {
    const towns = new Map();
    const getTown = row => {
        const key = `${row.owner_id}:${row.town_seed}`;
        let town = towns.get(key);
        if (!town) {
            town = { seed: String(row.town_seed), name: null, farmers: [], links: [], townHistory: null,
                inventions: [], battles: [] };
            towns.set(key, town);
        }
        return town;
    };

    for (const row of rows) {
        const payload = row.payload || {};
        const town = getTown(row);
        if (!town.name && payload.town) town.name = String(payload.town);
        if (row.kind === 'farmer-life') {
            const life = payload.life || {};
            const list = value => Array.isArray(value) ? value : [];
            const memories = [...list(life.creeds), ...list(life.beliefs), ...list(life.episodic)]
                .filter(Boolean).map(String).slice(0, 18);
            if (life.name && memories.length) town.farmers.push({ name: String(life.name), seed: String(life.seed ?? ''), memories });
        } else if (row.kind === 'town-history') {
            town.townHistory = historyText(payload.history);
        } else if (row.kind === 'town-inventions') {
            const recipes = Array.isArray(payload.inventions?.recipes) ? payload.inventions.recipes : [];
            town.inventions = recipes.map(r => `${r.name}${r.inventor ? ` — first made by ${r.inventor}` : ''}${r.lore ? `: ${r.lore}` : ''}`).slice(0, 24);
        } else if (row.kind === 'battle') {
            const battle = payload.battle || {};
            town.battles.push({ foe: battle.nemesis?.name || battle.clan || null, day: battle.day || '',
                year: battle.year || '', text: String(row.content || '') });
        }
    }

    const out = [];
    for (const town of towns.values()) {
        if (!town.farmers.length && !town.townHistory && !town.inventions.length && !town.battles.length) continue;
        const firsts = new Map(town.farmers.map(f => [f.name.split(' ')[0], f.name]));
        const seen = new Set();
        for (const farmer of town.farmers) {
            const own = farmer.name.split(' ')[0];
            for (const text of farmer.memories) for (const [first, full] of firsts) {
                if (first === own || !new RegExp(`\\b${escapeRe(first)}\\b`).test(text)) continue;
                const key = [farmer.name, full].sort().join('|');
                if (seen.has(key)) continue;
                let label = 'knows';
                for (const [re, value] of RELS) if (re.test(text)) { label = value; break; }
                seen.add(key); town.links.push({ a: farmer.name, b: full, label });
            }
        }
        out.push(town);
    }
    out.sort((a, b) => (b.farmers.length - a.farmers.length) || String(a.seed).localeCompare(String(b.seed)));
    return out;
}

module.exports = async function handler(req, res) {
    try {
        memory.ownerId(req, res);
        const rows = await memory.graphRows();
        if (!rows) return send(res, { towns: [], source: 'offline', count: 0, townCount: 0, embedded: 0,
            error: 'cockroachdb not configured' });
        const towns = shape(rows);
        return send(res, { towns, source: towns.length ? 'cockroachdb' : 'empty',
            count: towns.reduce((n, t) => n + t.farmers.length, 0), townCount: towns.length,
            embedded: rows.filter(r => r.embedded).length });
    } catch (error) {
        return send(res, { towns: [], source: 'offline', count: 0, townCount: 0, embedded: 0,
            error: error?.message || 'cockroachdb unavailable' });
    }
};

module.exports.shape = shape;
