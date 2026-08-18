# Hosting Verdant Signal

The source of truth is `github.com/icyzh/verdant-signal`. The Dockerfile serves the browser game and API
handlers directly with Node; there is no browser build step and no second deployment repository.

## Required configuration

```sh
PORT=8080
DATABASE_URL=postgresql://...  # CockroachDB TLS URL
```

Optional services:

```sh
PINECONE_API_KEY=...           # reserved for Pinecone embedding inference
OPENAI_API_KEY=...             # expressive dialogue only
OPENAI_BASE_URL=...            # any OpenAI-compatible endpoint
RY_FARMS_LLM_MODEL=...
MEMORY_EMBEDDINGS_OFF=1        # structured CockroachDB memory without embeddings
```

Apply `db/001_agent_memories.sql` before enabling database-backed memory. Secrets belong in the hosting
platform's environment, never in the image or repository.

## Deploy

Build from the repository root with `Dockerfile`, expose the injected `PORT`, and deploy `main`. The image
runs as the non-root `node` user and copies files through an explicit allowlist.

Before shipping:

```sh
node tests/compat.mjs
node tests/determinism.mjs
node tests/writeback-guards.mjs
```

After shipping, verify `/`, `/api/build`, `/api/knowledge-graph`, and `/api/memory-graph`. Static art is cached
for 30 days, so use versioned filenames whenever replacing an existing asset.

Legacy CraftPix source packs are not part of this repository. Only original Verdant Signal art under
`assets/verdant-signal/` may be committed here.
