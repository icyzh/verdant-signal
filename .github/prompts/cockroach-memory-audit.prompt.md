---
description: Audit Verdant Signal's live CockroachDB memory through the managed MCP server
---

Use only the `cockroachdb-cloud` MCP connection for this audit. Start read-only and do not insert,
update, or delete data unless the user explicitly asks for a mutation.

1. List the available databases and confirm `defaultdb` is accessible.
2. List its tables and inspect the schema of `agent_memories`.
3. Report total memories and the count with embeddings, grouped by `kind`.
4. Report the ten most recently updated colonies by `town_seed`; do not expose `owner_id` values.
5. Explain, without executing a write, the nearest-neighbour query that orders `embedding` with `<->`.
6. Check that `agent_memories_embedding_idx` exists and summarize whether vector retrieval is ready.
7. Cite the MCP tool used for each observation and clearly distinguish observed data from inference.

Useful read-only SQL:

```sql
SELECT kind, count(*) AS memories, count(embedding) AS embedded
FROM agent_memories
GROUP BY kind
ORDER BY kind;
```

```sql
SELECT town_seed, count(*) AS memories, max(updated_at) AS last_memory
FROM agent_memories
GROUP BY town_seed
ORDER BY last_memory DESC
LIMIT 10;
```
