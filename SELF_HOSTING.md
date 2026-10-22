# Self-hosting fx0

`docker compose` runs fx0 and everything it needs on one machine, with no Vercel account, AI Gateway, Neon or Upstash. Once the images and a model are on the machine, it runs with no internet at all.

| Service | Replaces | What it is |
|---|---|---|
| `app` | Vercel | fx0, built with `FX0_LOCAL=1` |
| `ollama` | AI Gateway | Runs the model, through its OpenAI-compatible API |
| `postgres` | Neon | Accounts, chat ownership, history, design versions |
| `redis` + `redis-http` | Upstash Redis | Transcripts and live state, behind Upstash's REST API ([serverless-redis-http](https://github.com/hiett/serverless-redis-http)) |
| `fx-sessions` volume | Vercel Workflow World and Queues | libfx keeps each session in files and recovers turns in-process |
| `migrate` | `npm run db:migrate` | Applies `migrations/` on start, then exits |

## Start

```sh
cp selfhost.env.example .env
# Set SESSION_SECRET in .env (at least 32 random characters)
docker compose build
docker compose up -d
docker compose --profile setup run --rm pull-model   # downloads FX0_MODEL once
```

Open http://localhost:3000 and choose **Sign in**. There is one local account and no password. Anyone who can reach the port is that user, so the port is bound to `127.0.0.1` by default. To serve other machines, set `FX0_BIND=0.0.0.0` and `APP_URL=http://<host>:3000` in `.env`. Only do that on a network you trust, or put an authenticating reverse proxy in front of fx0. `APP_URL` must be exactly the address the browser uses, or fx0 refuses requests as cross-origin.

## Models

`FX0_MODEL` is the model new chats start on. List others in `FX0_LOCAL_MODELS` to offer them in the picker, and pull each one with `docker compose exec ollama ollama pull <model>`. The agent writes whole HTML pages through tool calls, so pick a model that calls tools well and is as large as your hardware allows. Some candidates are `qwen3:14b`, `qwen3:32b`, `qwen3-coder:30b`, `gpt-oss:20b` and `llama3.3:70b`. Small models work, but their designs are plain.

`FX0_CONTEXT_WINDOW` (default 32768) sets both Ollama's context length and the window fx0 compacts against, so the two always match. A bigger window needs more memory.

On CPU, each model step can take minutes. For an NVIDIA GPU, install the NVIDIA Container Toolkit and uncomment the `deploy` block under `ollama` in `docker-compose.yml`.

To use another OpenAI-compatible server, such as vLLM, llama.cpp or LM Studio, set `FX0_LOCAL_MODEL_URL` (ending in `/v1`) and, if the server needs one, `FX0_LOCAL_MODEL_KEY`. For a server on the Docker host, use `http://host.docker.internal:<port>/v1`. On Linux, also add `extra_hosts: ["host.docker.internal:host-gateway"]` to `app`.

## A machine with no internet

Build and download on a connected machine, then carry the results over:

```sh
# Connected machine
docker compose build
docker compose up -d ollama
docker compose --profile setup run --rm pull-model
docker compose pull postgres redis redis-http ollama
docker pull alpine:3.20
docker save -o fx0-images.tar devselfhost/fx0:0.1.1 postgres:17-alpine redis:7.4-alpine alpine:3.20 \
  hiett/serverless-redis-http:0.0.10 ollama/ollama:0.12.6
docker run --rm -v "$(basename "$PWD")_ollama:/from" -v "$PWD:/to" alpine:3.20 tar czf /to/ollama-models.tgz -C /from .

# Offline machine, in a copy of this repository with its .env
docker load -i fx0-images.tar
docker volume create "$(basename "$PWD")_ollama"
docker run --rm -v "$(basename "$PWD")_ollama:/to" -v "$PWD:/from" alpine:3.20 tar xzf /from/ollama-models.tgz -C /to
docker compose up -d --no-build
```

Compose names the volume after the project directory, so run both halves from directories with the same name, or set `COMPOSE_PROJECT_NAME` on both machines.

## What differs from fx0 on Vercel

- No web search: AI Gateway ran it. The `web_fetch` tool remains but reaches only the hosts the server can reach.
- No billing, credits or teams. The account menu shows the single local team.
- No reasoning effort or fast mode. A local server advertises neither.
- No free-prompt trial or BotID.
- Images reach the model only when `FX0_LOCAL_VISION=1` and the model supports vision.
- One `app` container runs every turn, and a restart doesn't resume turns on its own. libfx's local durability has no durable queue. A turn cut off by a restart stays saved in the `fx-sessions` volume and continues from its last step when its chat next gets a message.

## Data

Everything lives in Docker volumes: `postgres`, `redis`, `fx-sessions` and `ollama`. `docker compose down` keeps them. `docker compose down -v` deletes every chat and downloaded model.
