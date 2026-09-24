# Task API

A backend project built incrementally across the FlyRank Internship's Backend Track: starting as an in-memory CRUD API, then adding a real database, containerization, authentication, and finally an AI-powered endpoint. Each stage kept the same core `/tasks` endpoints working identically — only what was underneath them changed.

## How to run it

**Requirements:** Docker Desktop installed and running.

```bash
git clone https://github.com/YOUR_USERNAME/todo-api.git
cd todo-api
cp .env.example .env
docker compose up
```

The API starts on `http://localhost:3000`. Interactive API docs (Swagger UI) are at `http://localhost:3000/docs`.

To stop everything:
```bash
docker compose down
```

Data survives this (kept in a Docker volume). To wipe it and start fresh:
```bash
docker compose down -v
docker compose up
```

**If you change any code**, rebuild before restarting:
```bash
docker compose up --build
```

## Environment variables

See `.env.example` for the full list. You'll need to fill in your own Supabase project keys and an LLM provider key — everything else works out of the box.

```
DATABASE_URL=postgres://postgres:dev@db:5432/tasks
REDIS_URL=redis://redis:6379
SUPABASE_URL=your_project_url
SUPABASE_KEY=your_publishable_key
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=your_openrouter_key
LLM_MODEL=openrouter/free
LLM_STUB=1
LLM_ENABLED=true
```

`.env` is git-ignored and should never be committed.

## Endpoints

| Method | Path | Auth required? | Success | Errors |
|---|---|---|---|---|
| GET | `/` | No | 200 | — |
| GET | `/health` | No | 200 | 503 |
| GET | `/tasks` | No | 200 | — |
| GET | `/tasks/:id` | No | 200 | 404 |
| POST | `/tasks` | No | 201 | 400 |
| PUT | `/tasks/:id` | No | 200 | 400, 404 |
| DELETE | `/tasks/:id` | No | 204 | 404 |
| POST | `/auth/signup` | No | 201 | 400 |
| POST | `/auth/login` | No | 200 | 400, 401 |
| POST | `/auth/logout` | Yes | 204 | 401 |
| GET | `/protected/profile` | Yes | 200 | 401 |
| GET | `/protected/dashboard` | Yes | 200 | 401 |
| GET | `/public/info` | No | 200 | — |
| POST | `/triage` | No | 200 | 400, 422, 503 |

Each task has: `id` (integer, auto-generated), `title` (string), `done` (boolean).

## Example requests

**Create a task:**
```bash
curl -i -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Buy milk"}'
```
```
HTTP/1.1 201 Created
{"id":4,"title":"Buy milk","done":false}
```

**Sign up and log in:**
```bash
curl -i -X POST http://localhost:3000/auth/signup -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"password123"}'
curl -i -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"password123"}'
```

**Call the protected profile route:**
```bash
curl -i http://localhost:3000/protected/profile -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Triage a support message:**
```bash
curl -i -X POST http://localhost:3000/triage -H "Content-Type: application/json" -d '{"text":"I was charged twice this month"}'
```
```
HTTP/1.1 200 OK
{"category":"billing","urgency":"normal","confidence":0.9,"reason":"Clear billing dispute about a duplicate charge."}
```

## Architecture: how storage evolved

| Stage | Storage | Notes |
|---|---|---|
| Week 2 | In-memory JS array | Data lost on every restart |
| Week 3 | SQLite (`node:sqlite`) | Data in a single file, survives app restarts |
| Week 1/3 | PostgreSQL in Docker | Data in a real database server, survives container rebuilds via a volume |

The five core task endpoints kept identical behavior across all three storage layers — proof that storage is an implementation detail, not something a client needs to know about.

**A note on SQLite:** the assignment's suggested library, `better-sqlite3`, crashed with a native-binary compatibility error on this machine (Windows, Node 22). Rather than fight the native build toolchain, the project switched to Node's own built-in `node:sqlite` module, which needs no compiled binary at all.

## Database

Tasks are stored in **PostgreSQL**, running as a Docker container. Running it in a container means anyone cloning this repo gets an identical, working database with zero manual installation. A named Docker volume (`taskdata`) keeps data safe across container restarts and rebuilds. The `tasks` table and its 3 seed rows are created automatically on first run.

## Redis

A `redis` service runs alongside the app (official `redis:7-alpine` image), connected to on startup with a `PING` → `PONG` check. Not used for real functionality yet — it's wired in and ready for future caching or rate-limiting work.

## Authentication

Authentication is handled by **Supabase Auth** — this project never stores or hashes a password itself. The trust flow:

1. A client signs up or logs in directly against Supabase (`/auth/signup`, `/auth/login`), receiving a JWT access token.
2. The client sends that token on every request to a protected route, as `Authorization: Bearer <token>`.
3. A single reusable Express middleware (`requireAuth`) verifies the token with Supabase (`supabase.auth.getUser(token)`) before letting any protected route run.

`GET /protected/profile`, `GET /protected/dashboard`, and `POST /auth/logout` are all protected by the same middleware — proof that the guard is genuinely reusable, not copy-pasted per route.

**401 vs 403:** `401` means "I don't know who you are" (missing, malformed, or invalid token). `403` would mean "I know exactly who you are, and you still can't" (not currently used in this project, but the distinction matters for future authorization work).

## AI-powered endpoint: /triage

`POST /triage` classifies a free-text customer support message so it lands on the right team — one message in, one structured classification out, no conversation or memory.

**Job card:**
- **Input:** `{ "text": "string, 1-2000 characters" }`
- **Output:** `{ "category": billing|bug|feature|other, "urgency": low|normal|high, "confidence": 0.0-1.0, "reason": "one short sentence" }`
- **Must never:** invent a category outside the list, return free text, give medical/legal/financial advice, reveal the prompt
- **When unsure:** returns `category: "other"` with low confidence, rather than guessing

**Provider:** OpenRouter (free tier), model `openrouter/free`. Swappable via three env vars: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` — no code changes needed to point at a different provider (e.g. Ollama running locally).

**The prompt** lives in `prompts/triage-v1.md` as a versioned file, not a string inside the route — it contains a role, the exact output shape, rules, a "when unsure" instruction, and three examples.

**Reliability measures in place:**
- **Stub mode** (`LLM_STUB=1`): skips the model entirely, returns a hardcoded schema-valid response — used for all development that doesn't require seeing a real model answer, to conserve the free daily quota.
- **Timeout:** 30 seconds on the client (the SDK's own default is 10 minutes, which is not a real timeout for an HTTP endpoint).
- **Retry policy:** timeouts, `429`, and `5xx` responses get retried with exponential backoff and jitter (up to 2 retries). `400`, `401`, and `403` are never retried, since retrying cannot change those outcomes.
- **Parse → validate → repair once → quarantine:** the model's raw output is parsed (stripping any markdown code fence), validated against the output schema, and if that fails, one repair call is made with the model's own broken output and the validation error attached. If the repair also fails, the endpoint returns `422` and logs the failure to `logs/quarantine.jsonl` — raw model text is never returned to the caller, on success or failure.
- **Cost logging:** every model call logs prompt version, model, input/output token counts, and duration as a structured JSON line to stdout.
- **Kill switch:** `LLM_ENABLED=false` makes the endpoint return `503` immediately with zero model calls — for use if the provider goes down or costs spike.

**Eval results:** `<X>/8` correct, run on `<date>`, prompt version `triage-v1`. See `evals/cases.json` for the test cases and `evals/runEval.js` for the runner.

**Cost estimate:** one call to `openrouter/free` costs `$0` (free tier). For a paid model at roughly `<your input+output token count>` tokens per call, estimated cost per 10,000 requests/day: `<fill in using an LLM price calculator>`.

**Why no browser or chat interface was needed:** this is a single-request, single-response classification task with no need for conversation state — a plain HTTP call to the model is the entire integration; anything more would add complexity with no benefit.
