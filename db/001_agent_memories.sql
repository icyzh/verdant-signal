CREATE TABLE IF NOT EXISTS agent_memories (
    owner_id UUID NOT NULL,
    memory_key STRING NOT NULL,
    kind STRING NOT NULL CHECK (kind IN ('farmer-life', 'town-history', 'town-inventions', 'battle')),
    town_seed INT8 NOT NULL,
    farmer_seed INT8,
    revision INT8 NOT NULL CHECK (revision >= 0),
    title STRING NOT NULL,
    content STRING NOT NULL,
    payload JSONB NOT NULL,
    embedding VECTOR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, memory_key)
);

CREATE INDEX IF NOT EXISTS agent_memories_town_idx
    ON agent_memories (owner_id, town_seed, kind);

CREATE INDEX IF NOT EXISTS agent_memories_recent_idx
    ON agent_memories (kind, updated_at DESC);

CREATE VECTOR INDEX IF NOT EXISTS agent_memories_embedding_idx
    ON agent_memories (kind, embedding);
