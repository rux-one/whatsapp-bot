# WhatsApp Bot

A WhatsApp bot built on [`whatsapp-web.js`](https://wwebjs.dev/), driven by a local
[Ollama](https://ollama.com/) LLM. It:

- **Answers with an LLM that can use tools** when you `@mention` it **or reply to one of its
  messages** — the mention handle (if any) is stripped and the rest is sent to Ollama. The model can
  call tools (look up the pizza menu, search the web) and the answer is fed back automatically.
  When a reply used tools, it ends with a `🔧 <tool names>` marker. Conversation history is kept per
  chat for context.
- **Greets new members** when they join a group chat.
- **Responds to slash commands** `/greet` and `/hello` (in DMs or groups) with `Hello, World! 👋`.

It does **not** reply to ordinary, non-mention messages, so it stays quiet in busy groups.

## Requirements

- Node.js ≥ 18 (tested on v24).
- A dedicated WhatsApp account on a phone that stays online.
- A running [Ollama](https://ollama.com/) server with a model pulled, e.g. `ollama pull llama3.1`.
- On a **headless Linux server**, the bundled Chromium needs system shared libraries. The
  `whatsapp-web.js` npm package downloads the Chromium *binary*, but not these OS-level deps:

  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 ca-certificates fonts-liberation
  ```

  Without these the process hangs and never prints a QR code. On a local desktop they are
  usually already present.

## Configuration

Config lives in a gitignored `.env` file (copy the template):

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `WA_ALLOWED_GROUPS` | *(empty = all)* | Comma-separated group IDs the bot acts in |
| `WA_CLIENT_ID` | `whatsapp-bot` | Session name (run multiple bots side by side) |
| `WA_DATA_PATH` | `./.wwebjs_auth` | Where the session **and chat history** are stored — point at a persistent volume in deployment |
| `OLLAMA_URL` | `http://localhost:11434` | Base URL of the Ollama server |
| `OLLAMA_MODEL` | `gemma4:12b` | Model used for replies — **must support tool calling** (e.g. `gemma4:12b`, `llama3.1`, `qwen2.5`) |
| `BRAVE_API_KEY` | *(empty)* | [Brave Search API](https://brave.com/search/api/) token for the `web_search` tool; without it that tool degrades gracefully |

The greeting text and trigger commands are not sensitive, so they stay as constants at the top
of `src/bot.js` rather than in `.env`.

### LLM behavior

- The **system prompt** is assembled at startup from two files in `prompts/`:
  - `SOUL.md` — *who* the assistant is (personality, language, response style).
  - `SYSTEM.md` — *what* it does (operational rules for when to use each tool).

  `SOUL.md` is prepended so the identity frames the rules. Restart after editing either.
  (`prompts/AGENT.md` — the meetup knowledge base — is **not** loaded right now; it's kept for a
  future iteration where it becomes OKF docs.)
- **Tools** live in `src/tools/` and are auto-discovered. Two ship today:
  - `list_pizzas` — reads the [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
    pizza catalog under `pizza/` (one markdown file per pizza). Editing/adding a pizza file changes
    the menu with no code change.
  - `web_search` — Brave Search (needs `BRAVE_API_KEY`).

  **Add a tool** by dropping a file in `src/tools/` exporting
  `{ name, description, parameters, handler }` — no other wiring needed.
- **Chat history** is per chat (a group is one shared thread), capped to the last ~20 turns, and
  persisted to `chat-history.json` under `WA_DATA_PATH` so context survives restarts. Only the user
  message and the model's final text are stored (intermediate tool calls and the `🔧` marker are not).
  The system prompt is always included regardless of the cap.

The WhatsApp login itself is **not** in `.env` — it's a session stored under `WA_DATA_PATH`
(via `LocalAuth`). Keep that directory persistent across restarts so you don't re-scan the QR,
and never commit it (it holds your session credentials).

## Setup

```bash
npm install
cp .env.example .env   # then edit if needed
npm start
```

1. A QR code renders in the terminal.
2. On the bot's phone: **WhatsApp → Settings → Linked Devices → Link a Device** → scan it.
3. Wait for `✅ Bot connected and ready!`.

The session is saved to `.wwebjs_auth/` (via `LocalAuth`), so you only scan once — restarts
reconnect automatically. Never commit `.wwebjs_auth/` (it holds session credentials; already
in `.gitignore`).

## Testing

- **Slash command:** from another number, DM `/hello` → bot replies `Hello, World! 👋`.
  Send a normal message → bot stays silent.
- **Group join:** add a new member to a group the bot is in → bot posts a welcome greeting.
- **Persistence:** stop (`Ctrl-C`) and `npm start` again → no QR re-scan.

## Run with Docker

The image bundles Chromium, so no host setup is needed beyond Docker. Config still comes from `.env`
(via `env_file`); it is **not** baked into the image.

```bash
cp .env.example .env          # set OLLAMA_URL / OLLAMA_MODEL etc.
docker compose up -d --build  # start detached
docker compose logs -f        # watch for the QR, then for "✅ Bot connected and ready!"
```

1. Scan the QR from the logs **once**.
2. **Wait ~1 minute after `✅ Bot connected and ready!` before doing anything else.** WhatsApp finishes
   linking the device in the background after the scan; stopping/restarting too soon makes WhatsApp
   *unpair* the device and you'll get a fresh QR on the next start.
3. That's it — leave it running. `Ctrl-C` to stop the `logs -f` follow; the container keeps running.

To stop or restart, use compose commands — **do not `Ctrl-C` an attached `docker compose up`** to stop
it (the `restart: unless-stopped` policy will just relaunch it, churning the WhatsApp connection):

```bash
docker compose stop           # stop without removing
docker compose restart        # clean restart (reconnects with no new QR)
docker compose down           # stop and remove the container (session stays in ./data)
```

The WhatsApp session **and** `chat-history.json` are stored in the local **`./data/`** directory
(bind-mounted to `/data` via `WA_DATA_PATH`), so restarts/redeploys reconnect without a new QR. The
directory is gitignored.

**Notes:**
- **Don't kill it right after the scan** — see step 2; this is the #1 cause of "asks for the QR every
  time." Give it a minute to finish linking, then it survives restarts indefinitely.
- **`init: true` + `stop_grace_period: 30s`** ensure Chromium shuts down cleanly (flushes the session).
- **Config/secrets** stay in `.env` only — injected at runtime via `env_file`, never baked into the
  image (`.env` is in `.dockerignore`).
- **Container runs as root** so the `./data` bind mount is writable regardless of host uid; files it
  writes there will be root-owned (use `sudo` to remove them if needed).
- **Reaching Ollama:** a bridge-network container reaches a Tailscale `OLLAMA_URL` (e.g.
  `http://100.64.0.7:11434`) via the host's `tailscale0` route, which normally works. If it can't
  connect, add `network_mode: host` to the `whatsapp-bot` service in `docker-compose.yml`.
- **Don't change `WA_CLIENT_ID`** once scanned — it renames the session folder and forces a new QR.

## Running persistently without Docker

```bash
npm install -g pm2
pm2 start src/bot.js --name whatsapp-bot
pm2 save
```

## Notes & limitations

- `whatsapp-web.js` is an **unofficial** library; automating a personal account is against
  WhatsApp's ToS. Risk is low for personal, low-volume use but real — use a dedicated number.
- If WhatsApp Web changes its internals the library can break until updated. The version is
  pinned (`whatsapp-web.js@1.34.7`) for reproducibility.
- `group_join` only fires while the bot account is a participant of the group.
- `LocalAuth` needs a persistent filesystem — not suitable for ephemeral hosts.
