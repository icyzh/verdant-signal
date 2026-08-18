import assert from 'node:assert/strict';
import fs from 'node:fs';

const raw = fs.readFileSync(new URL('../.vscode/mcp.json', import.meta.url), 'utf8');
const config = JSON.parse(raw);
const server = config.servers?.['cockroachdb-cloud'];

assert.equal(server?.type, 'http');
assert.equal(server?.url, 'https://cockroachlabs.cloud/mcp');
assert.equal(server?.headers?.['mcp-cluster-id'], '220f8967-b191-4230-978c-b57999306345');
assert.doesNotMatch(raw, /authorization|bearer|api[_ -]?key|token|secret/i,
    'MCP config must use interactive OAuth and contain no credential');

console.log('CockroachDB Cloud MCP config is valid, cluster-scoped, and secret-free.');
