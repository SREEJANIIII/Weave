# Weave prototype

Weave answers one everyday question across the apps you use, shows the exact records behind every point, and drafts changes that only happen after you approve them. This is the wHACKiest 2026 prototype (Track 1: Make MCP Matter).

```
Ask ──▶ Weave app ──▶ planner (Claude, or the offline script)
                          │  picks tools
                          ▼
                     MCP client ──tools/list, tools/call──▶ MCP servers: Calendar · Notes · Tasks · Money
                          │
             reads run straight away · writes are held as drafts
                          ▼
     cited answer + drafts ──▶ you approve ──▶ write runs ──▶ read back to confirm
```

## Project layout

```
Weave/
├── frontend/      React + Vite UI (everyday page, developer mode, prototype app)
│   ├── src/           Pages, components, hooks, and scoped stylesheets
│   ├── public/        Fonts, favicons, manifest, and Netlify SPA redirects
│   ├── vite.config.js Vite config with /api proxy to the backend
│   └── package.json
├── backend/       Node server, planners and the five MCP servers
│   ├── src/           HTTP server, MCP client, planners
│   ├── mcp-servers/   Calendar, Notes, Tasks, Money
│   ├── lib/           Shared date helpers
│   ├── data/          Optional statement CSV for the Money server
│   ├── scripts/       Smoke test
│   └── .env.example
├── scripts/       Monorepo dev runner (backend + Vite dev server)
└── package.json   Shortcuts that build/run frontend and backend together
```

## Run it

Needs Node 22.5 or later. Wishlist, size profiles, and reminders use MongoDB Atlas through Mongoose. The UI in `frontend/` is built with React + Vite, and the Node server in `backend/` serves the built React app (`frontend/dist`) and `/api/*`.

### 1. Install

```bash
npm install          # from the repo root; installs backend/ and frontend/ dependencies
```

### 2. Start the app (production build served by backend)

From the repo root:

```bash
npm start            # builds frontend/dist and starts backend on http://localhost:4321
```

Or run the frontend and backend in hot-reload dev mode (Vite on `http://127.0.0.1:5173` proxying `/api/*` to the backend on `4321`):

```bash
npm run dev
```

Then open <http://localhost:4321> (with `npm start`) or <http://127.0.0.1:5173> (with `npm run dev`).

### 3. Working on the frontend

Run `npm run dev` from the repo root for instant React HMR while talking to the live MCP backend, or run `npm run build` to rebuild `frontend/dist` for `npm start`. Changes in `backend/` need a server restart.

### Planners

- **Offline planner** (default when no key is found): a fixed script for the demo questions plus deterministic wishlist, occasion, and size-matching demonstrations. It makes the same real MCP calls and follows the same rules.
- **Claude planner**: set a key, restart, and pick *Claude* in the top bar. Claude chooses which MCP tools to call and writes the cited answer.

Still in `backend/`:

```bash
cp backend/.env.example backend/.env   # then put your key in backend/.env (or: ant auth login)
npm start
```

The `.env` file must be in `backend/`, because the start script reads it from there.

### Port

The default port is `4321`. To change it:

```bash
PORT=5000 npm start
```

### Smoke test

Check everything still works end to end (offline, about 5 seconds):

```bash
npm run smoke
```

## What's real and what isn't

| Part | Status |
|---|---|
| MCP protocol: client, `tools/list`, `tools/call`, tool annotations | **Real**, using the official `@modelcontextprotocol/sdk` over stdio |
| Calendar, Notes, Tasks, Money, and Wishlist & sizes servers | **Real MCP servers, sample data.** The data is generated relative to today so the demo works on any day. Nothing connects to a real account or shopping platform. |
| Money | Reads `backend/data/statement.csv` if you add one (format in `backend/data/statement.example.csv`); otherwise a sample statement. Never connects to a bank or UPI app. |
| Approval gate | **Real.** Any tool not marked `readOnlyHint: true` is held as a draft; it runs only after you approve, then Weave reads the record back before saying "Done". |
| Wishlist and size intelligence | **Implemented with MongoDB Atlas persistence and synthetic charts.** Wishlist CRUD, occasion tags, a clearly labelled sample profile, deterministic brand/category charts, unit conversion, missing-measurement and between-size handling are available through the Wishlist & sizes MCP server. |
| Occasion-aware reminders | **Implemented as a read-and-suggest workflow.** Upcoming records from Calendar are matched to wishlist occasion tags in configurable 30/14/7-day windows. Creating a Task or Calendar reminder remains approval-gated. Festival dates are not hardcoded. |
| Claude planner | Built on the Anthropic SDK's tool runner with `claude-opus-5-5`. **Not tested against the live API on this machine** (no key was available). The offline path is fully tested. |
| Email, fitness apps, travel, learning, home | **Planned.** Shown as planned in the app and not connected. |

## Demo script (about 2 minutes)

1. Point at the left rail: five MCP servers, the tools each one exposes, and which ones *ask first*.
2. Ask *"What should I follow up on today, and when can I fit in a workout?"* and watch the MCP calls stream in.
3. Hover a citation number: the matching record lights up on the right.
4. Open **Edit** on the run, move it to 6:30, then **Approve**. The card says it was added and read back from the calendar. Open **MCP activity** to show the held write, the approval and the read-back.
5. Ask the same question again: the task isn't drafted twice, and the run shows as already booked.
6. Switch **Tasks** off and ask again: Weave says what it couldn't check instead of guessing.
7. Ask *"How much did I spend on food last week, and what was happening on those days?"* and note the caveat: the calendar is context, not the cause.
8. **Reset demo** restarts MCP servers and clears pending proposals; it does not delete persistent wishlist items, measurements, or reminders.

## How it fits together

| Path | What it does |
|---|---|
| `backend/mcp-servers/*.js` | Five MCP servers (`McpServer` + stdio). Tools carry MCP annotations: reads are `readOnlyHint: true`; wishlist/profile mutations, `create_task`, and `create_event` are not. |
| `backend/src/hub.js` | Weave's MCP client. Spawns each server, discovers tools, calls them, and logs every message for the activity panel. |
| `backend/src/run.js` | One question = one run. Reads register citable sources, writes become drafts, and the answer may only cite records that were actually read. |
| `backend/src/agent-claude.js` | Claude planner: each MCP tool becomes a tool for the SDK's tool runner; write tools only create drafts. The final answer comes back through a strict `present_answer` tool. |
| `backend/src/agent-offline.js` | Offline planner for the core demo questions plus deterministic wishlist/occasion/size workflows. |
| `backend/src/server.js` | Local HTTP server (127.0.0.1 only): serves `frontend/dist` (with SPA fallback), a streaming `/api/ask`, approve/dismiss, app switches, reset. |
| `frontend/` | React + Vite interface: everyday landing page (`/`), developer mode (`/developers`), and prototype app (`/app`). |

### Wishlist, sizes, and occasions

The `wishlist` MCP server exposes wishlist CRUD/search, size profile read/update/delete, synthetic chart lookup, deterministic matching, and persistent reminder tools (`list_reminders`, `reconcile_reminders`, and `dismiss_reminder`). Writes are held for approval by the existing Run/Hub gate. Measurements are sensitive: profile reads are only used for size work, matching does not return the complete profile, and measurement arguments are redacted from activity/SSE steps.

The size engine in `backend/lib/size-matcher.js` is deterministic. It compares a profile against brand/category/region-specific synthetic charts and reports confidence, missing measurements, out-of-range measurements, and a disclaimer that the recommendation is not a fit guarantee. No real brand size-chart API is connected.

The offline planner can answer questions such as “What have I saved for Diwali?”, “Show my wishlist for upcoming occasions”, and “Which size should I consider for this saved dress?”. It reads calendar records relative to today and matches their occasion tags; it does not calculate or assume festival dates.

### MongoDB Atlas persistence and privacy

Wishlist items, the size profile, and reminder records are stored in MongoDB Atlas through the centralized Mongoose connection in `backend/db/database.js`, models under `backend/models/`, and repositories under `backend/repositories/`. The database name is controlled by `MONGODB_DB_NAME` or the URI. Weave creates indexes through Mongoose; repeated startup is safe. There is no local or in-memory fallback.

Demonstration wishlist/profile documents are inserted only when their collections are empty. Existing user data is never overwritten on startup. The `/api/reset` demo action does not delete persistent data. The size-profile delete tool marks the profile deleted and clears its payload so it is not automatically reseeded. For a development reset, stop Weave and explicitly drop the configured test database or delete its collections; never run that against a user database.

Size profiles are single-user data in this prototype; there is no account authentication or multi-user isolation. Atlas encryption is not treated as application-level field encryption. For application-level encryption, set `WEAVE_PROFILE_ENCRYPTION_KEY` to a base64-encoded 32-byte key. AES-256-GCM is used with a fresh IV per update. If an encrypted profile exists without the key, reads fail safely rather than returning data. Do not commit keys, `.env`, or real data.

Reminder reconciliation uses a unique `(wishlist_item_id, calendar_event_id, reminder_window)` constraint. It updates event dates for active reminders, preserves dismissed/completed/cancelled states, removes reminders for archived/deleted items and past events, and supports 30-, 14-, and 7-day windows. This is on-demand reconciliation when Weave is asked; background notifications and schedulers are not implemented.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Enables the Claude planner (an `ant auth login` profile also works). |
| `WEAVE_MODE` | `claude` if a key is found, else `offline` | Starting planner. |
| `WEAVE_MODEL` | `claude-opus-5-5` | Model for the Claude planner. |
| `WEAVE_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh` or `max`. |
| `WEAVE_TODAY` | today | Pin "today" (YYYY-MM-DD) for a repeatable demo. |
| `WEAVE_STATEMENT_CSV` | `data/statement.csv` (relative to `backend/`) | Statement file for the Money server. |
| `MONGODB_URI` | none | Required MongoDB Atlas connection string. |
| `MONGODB_DB_NAME` | URI-selected database | Optional database name passed to Mongoose. |
| `WEAVE_PROFILE_ENCRYPTION_KEY` | none | Optional base64-encoded 32-byte AES-256-GCM key for size-profile encryption. |
| `PORT` | `4321` | Server port. |

Claude requests use server-side refusal fallbacks (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta), so if the model declines, the API retries on a fallback model. Remove those two fields in `backend/src/agent-claude.js` to turn this off.

### MongoDB Atlas setup

1. Create an Atlas project and free/shared cluster.
2. Create a database user with access to the Weave database.
3. Add the development machine's IP address under Network Access (or use the project's controlled network policy).
4. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` and optionally `MONGODB_DB_NAME`. Keep credentials URL-encoded and never commit `.env`.
5. Start Weave with `npm start`. If the URI is missing or MongoDB cannot be reached, startup fails with an explicit error; no in-memory fallback is used.

Mongoose creates the `wishlistitems`, `sizeprofiles`, and `reminders` collections and their indexes. Reminder statuses are `suggested`, `pending_approval`, `approved`, `dismissed`, `completed`, and `cancelled`. Reconciliation is on demand; there is no background notification scheduler.

This phase does not automatically migrate an existing SQLite file into Atlas. Existing Atlas data is preserved and sample documents are inserted only into empty collections; any SQLite-to-Atlas migration should be an explicit, reviewed data operation.

### Adding a real app

Any MCP server can replace a sample one: add it to `SERVER_DEFS` in `backend/src/hub.js` with the command that starts it. Weave discovers its tools automatically. A tool that isn't marked read-only always goes through the approval gate. Real accounts need that server's own sign-in (usually OAuth), which this prototype doesn't include.

## Credits

Fonts: Newsreader, Schibsted Grotesk and IBM Plex Mono (SIL Open Font License, see `frontend/fonts`). Icons: Lucide (ISC License).
