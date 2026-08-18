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

## Low-cost AWS demo

For a hackathon deployment, `tools/deploy-aws.sh` packages the same server as an ARM64 Lambda ZIP and exposes
it through a public Lambda Function URL. This has no always-on compute, container registry, load balancer,
API Gateway, VPC, or NAT gateway. It deliberately sets `MEMORY_EMBEDDINGS_OFF=1` and leaves the database and
LLM unset, so the playable offline fallbacks are used and no model or database usage is billed.

Prerequisites are AWS CLI credentials, Node/npm, and `zip`. The default region is `ap-south-1`:

```sh
./tools/deploy-aws.sh
```

The deploy retains logs for three days, uses 512 MB of on-demand Lambda memory, and creates no provisioned
concurrency. Override names or region with `AWS_DEPLOY_REGION`, `AWS_FUNCTION_NAME`, and `AWS_ROLE_NAME`.

After the demo, stop all request charges immediately by setting reserved concurrency to zero:

```sh
aws lambda put-function-concurrency --region ap-south-1 \
  --function-name verdant-signal-demo --reserved-concurrent-executions 0
```

Delete the function from the AWS console when the demo is over. The IAM role and CloudWatch log group are
named `verdant-signal-demo-lambda` and `/aws/lambda/verdant-signal-demo`.

Legacy CraftPix source packs are not part of this repository. Only original Verdant Signal art under
`assets/verdant-signal/` may be committed here.
