# Weave prototype

Weave answers one everyday question across the apps you use, shows the exact records behind every point, and drafts changes that only happen after you approve them. This is the wHACKiest 2026 prototype (Track 1: Make MCP Matter).

```
Ask ──▶ Weave app ──▶ planner (NVIDIA, or the offline script)
Ask ──▶ Weave app ──▶ planner (NVIDIA, or the offline script)
                          │  picks tools
                          ▼
                     MCP client ──tools/list, tools/call──▶ MCP servers: Calendar · Notes · Tasks · Money · Wishlist · Appliances & Bills · Wardrobe
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
├── backend/       Express server, planners and the seven MCP servers
│   ├── src/           Express app and API routers, MCP client, planners
│   ├── mcp-servers/   Calendar, Notes, Tasks, Money, Wishlist, Appliances
│   ├── models/        Mongoose schemas (including appliances, documents, deadlines, reminders)
│   ├── repositories/  MongoDB data access
│   ├── services/      Appliance confirmation and reminder reconciliation
│   ├── lib/           Dates, PDF/OCR extraction, NVIDIA vision check, private uploads
│   ├── uploads/       Private local originals (created on first upload; never served by path)
│   ├── data/          Optional statement CSV for the Money server
│   ├── scripts/       Smoke test and unit/integration tests
│   └── .env.example
├── scripts/       Monorepo dev runner (backend + Vite dev server)
└── package.json   Shortcuts that build/run frontend and backend together
```

## Run it

Needs Node 22.5 or later. Wishlist, size profiles, and reminders use MongoDB (local MongoDB / Compass at `mongodb://127.0.0.1:27017/weave`, or MongoDB Atlas) through Mongoose. The UI in `frontend/` is built with React + Vite, and the Express server in `backend/` serves the built React app (`frontend/dist`) and `/api/*`. MongoDB must be reachable before the server starts; a failed connection prints an explicit error and the HTTP server is not started.

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

Run `npm run dev` from the repo root for instant React HMR alongside automatic `nodemon` backend restarts (or `npm --prefix backend run dev` for the backend alone), or run `npm run build` to rebuild `frontend/dist` for `npm start`.

### Planners

- **Offline planner** (default when no key is found): a fixed script for the demo questions plus deterministic wishlist, occasion, size-matching, and appliance-deadline demonstrations. It makes the same real MCP calls and follows the same rules.
- **NVIDIA planner**: set `NVIDIA_API_KEY`, restart, and pick *NVIDIA* in the top bar. NVIDIA's OpenAI-compatible API chooses which MCP tools to call and writes the cited answer.

Still in `backend/`:

```bash
cp backend/.env.example backend/.env   # then set NVIDIA_API_KEY in backend/.env
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

Backend unit/integration tests (extraction rules, capability verification, deduplication, recurrence and reminder-state persistence):

```bash
npm test                     # from the repo root
npm --prefix backend run test:appliances
```

## What's real and what isn't

| Part | Status |
|---|---|
| MCP protocol: client, `tools/list`, `tools/call`, tool annotations | **Real**, using the official `@modelcontextprotocol/sdk` over stdio |
| Calendar, Notes, Tasks, Money, Wishlist & sizes, and Wardrobe servers | **Real MCP servers.** Calendar/Notes/Tasks/Money use sample data, Wishlist uses MongoDB, and Wardrobe uses a local persistent review store. Nothing connects to a real account or shopping platform. |
| Money | Reads `backend/data/statement.csv` if you add one (format in `backend/data/statement.example.csv`); otherwise a sample statement. Never connects to a bank or UPI app. |
| Approval gate | **Real.** Any tool not marked `readOnlyHint: true` is held as a draft; it runs only after you approve, then Weave reads the record back before saying "Done". |
| Wishlist and size intelligence | **Implemented with MongoDB persistence and synthetic charts.** Wishlist CRUD, occasion tags, a clearly labelled sample profile, deterministic brand/category charts, unit conversion, missing-measurement and between-size handling are available through the Wishlist & sizes MCP server. |
| Occasion-aware reminders | **Implemented as a read-and-suggest workflow.** Upcoming records from Calendar are matched to wishlist occasion tags in configurable 30/14/7-day windows. Creating a Task or Calendar reminder remains approval-gated. Festival dates are not hardcoded. |
| Appliances & Bills | **Implemented.** PDF/JPG/JPEG/PNG uploads, PDF text extraction, local OCR, vision reading for handwriting, a review screen, deduplicated appliances, confirmed deadlines, recurring EMIs and configurable reminders. Documents are stored privately; unconfirmed values never become active reminders. |
| Wardrobe | **Implemented.** Garment photo upload for local review, editable garment metadata, persistent browse/search, archive, and occasion-based outfit recommendations. Image bytes remain local to the browser; metadata is persisted by the Wardrobe MCP server. |
| NVIDIA planner | Built on the official OpenAI JavaScript SDK against NVIDIA's OpenAI-compatible endpoint. Default model: `openai/gpt-oss-20b`; override with `NVIDIA_MODEL`. Document images use `NVIDIA_VISION_MODEL` and are only sent after image support is verified. |
| Email, fitness apps, travel, learning | **Planned.** Shown as planned in the app and not connected. |

## Demo script (about 2 minutes)

1. Point at the left rail: seven MCP servers, the tools each one exposes, and which ones *ask first*.
2. Ask *"What should I follow up on today, and when can I fit in a workout?"* and watch the MCP calls stream in.
3. Hover a citation number: the matching record lights up on the right.
4. Open **Edit** on the run, move it to 6:30, then **Approve**. The card says it was added and read back from the calendar. Open **MCP activity** to show the held write, the approval and the read-back.
5. Ask the same question again: the task isn't drafted twice, and the run shows as already booked.
6. Switch **Tasks** off and ask again: Weave says what it couldn't check instead of guessing.
7. Ask *"How much did I spend on food last week, and what was happening on those days?"* and note the caveat: the calendar is context, not the cause.
8. **Reset demo** restarts MCP servers and clears pending proposals; it does not delete persistent wishlist items, measurements, or reminders.
9. Open **Appliances** and upload a bill or warranty card. Check the found / unclear / conflicting badges, tick only the correct values, then **Confirm & save**. The dashboard now shows its deadlines and linked documents.
10. Ask *"Which warranties expire soon?"* or *"How much EMI is due this month?"* — answers cite the confirmed appliance records.

## How it fits together

| Path | What it does |
|---|---|
| `backend/mcp-servers/*.js` | Seven MCP servers (`McpServer` + stdio). Tools carry MCP annotations: reads are `readOnlyHint: true`; wishlist/profile mutations, wardrobe mutations, `create_task`, `create_event`, and appliance writes are not. |
| `backend/src/hub.js` | Weave's MCP client. Spawns each server, discovers tools, calls them, and logs every message for the activity panel. |
| `backend/src/run.js` | One question = one run. Reads register citable sources, writes become drafts, and the answer may only cite records that were actually read. |
| `backend/src/agent-nvidia.js` | NVIDIA planner: each MCP tool becomes an OpenAI function declaration; write functions only create drafts. The final answer comes back through `present_answer`. |
| `backend/src/agent-offline.js` | Offline planner for the core demo questions plus deterministic wishlist/occasion/size workflows. |
| `backend/src/server.js` | Entry point (127.0.0.1 only): connects to MongoDB, starts the MCP apps, then starts the Express server with `app.listen()` and handles graceful shutdown. |
| `backend/src/app.js` | Express app: `express.json()` (64 KB) and CORS middleware, the same-origin guard, static UI with SPA fallback, and a JSON error handler. |
| `backend/src/routes/api.js` | Express router: status, activity, streaming `/api/ask`, approve/dismiss, app switches, mode and reset. |
| `backend/src/routes/appliances.js` | Multipart upload validation, private document preview, review confirmation, and dashboard endpoints (which call the Appliances MCP server). |
| `backend/lib/document-pipeline.js`, `nvidia-vision.js`, `appliance-extraction.js` | PDF text, OCR and vision source preparation; image-capability verification; normalized, evidence-backed extraction. |
| `backend/services/appliance-service.js` | Confirmation, deduplication, recurring deadlines and reminder reconciliation. |
| `frontend/` | React + Vite interface: everyday landing page (`/`), developer mode (`/developers`), and prototype app (`/app`). |

### Wishlist, sizes, and occasions

The `wishlist` MCP server exposes wishlist CRUD/search, size profile read/update/delete, synthetic chart lookup, deterministic matching, and persistent reminder tools (`list_reminders`, `reconcile_reminders`, and `dismiss_reminder`). Writes are held for approval by the existing Run/Hub gate. Measurements are sensitive: profile reads are only used for size work, matching does not return the complete profile, and measurement arguments are redacted from activity/SSE steps.

The size engine in `backend/lib/size-matcher.js` is deterministic. It compares a profile against brand/category/region-specific synthetic charts and reports confidence, missing measurements, out-of-range measurements, and a disclaimer that the recommendation is not a fit guarantee. No real brand size-chart API is connected.

The offline planner can answer questions such as “What have I saved for Diwali?”, “Show my wishlist for upcoming occasions”, and “Which size should I consider for this saved dress?”. It reads calendar records relative to today and matches their occasion tags; it does not calculate or assume festival dates.

### Appliances & Bills

The Appliances MCP server (`backend/mcp-servers/appliances.js`) exposes 14 tools: search appliances, get details/documents/deadlines/reminders, list upcoming deadlines, confirm a reviewed document, save/update appliances, update deadlines, and create/update/reconcile reminders. All of them go through the same Hub/Run approval and citation rules as the other apps.

**Upload and extraction.** `POST /api/appliances/documents` accepts PDF, JPG, JPEG and PNG (magic bytes are checked, not just the declared MIME type; maximum 15 MB by default). Original bytes are written to a private directory with random filenames and `0600` permissions. The browser only receives a document id: preview bytes are served from `/api/appliances/documents/:id/file`, never from a client-supplied path. Digital PDFs use their text layer (`pdf-parse`); scanned PDFs are rendered to page images and read with local Tesseract OCR; images use OCR as well, and handwriting (or low-confidence OCR) uses the vision model. Before any image is sent, `backend/lib/nvidia-vision.js` checks the configured model's catalog modalities or performs a small image probe. If the model cannot accept images, extraction fails with an explicit error — there is no fabricated fallback.

**Review and confirmation.** Extraction produces per-field statuses `found`, `missing`, `unclear`, `conflicting` and `derived`, each with short verbatim evidence. The review screen shows the original document next to editable fields and deadlines; only values the user ticks become `confirmed`. Missing dates or amounts are never guessed, and conflicting values are shown as options. Confirming links the document to an appliance (matched by serial number, else brand/model/name plus purchase date), creates only the deadlines the user ticked, and generates reminders from those confirmed deadlines.

**Deadlines and reminders.** Warranty expiry, scheduled service, AMC renewal, EMI/payment and return/replacement deadlines are tracked per occurrence. Recurring EMIs are expanded into monthly occurrences (configurable horizon). Reminder windows are configurable (`APPLIANCE_REMINDER_WINDOWS`, default 30/14/7 days). Reconciliation refreshes dates when a confirmed deadline changes but preserves `dismissed`, `completed` and `cancelled` states. Dismissed and completed reminders never silently reappear. The dashboard shows upcoming confirmed deadlines, reminders and linked documents.

**Questions.** Both planners can answer "Which warranties expire soon?", "When is my next AC service?", "How much EMI is due this month?", "Can I still return my washing machine?" and "Which AMCs need renewal?" from MCP records, with source citations and approval-gated writes. Answers only use confirmed data and say so explicitly.

### Wardrobe

The Wardrobe MCP server (`backend/mcp-servers/wardrobe.js`) provides persistent garment browsing, search, save/update/archive, and occasion-based outfit recommendations. Open **Wardrobe** from the workspace sidebar or visit `/app/wardrobe`. The upload control reads a garment photo in the browser for review; the confirmed metadata is saved through `/api/wardrobe` and the Wardrobe MCP tools. Image bytes are not sent to an external model or stored by the current implementation.

### MongoDB persistence and privacy

Wishlist items, the size profile, reminders and appliance records are stored in MongoDB through the centralized Mongoose connection in `backend/db/database.js`, models under `backend/models/`, and repositories under `backend/repositories/`. Use local MongoDB (`mongodb://127.0.0.1:27017/weave`) for development or Atlas for hosted storage. The database name is controlled by `MONGODB_DB_NAME` or the URI. Weave creates indexes through Mongoose; repeated startup is safe. There is no in-memory fallback.

Demonstration wishlist/profile documents are inserted only when their collections are empty. Existing user data is never overwritten on startup. The `/api/reset` demo action does not delete persistent data. The size-profile delete tool marks the profile deleted and clears its payload so it is not automatically reseeded. For a development reset, stop Weave and explicitly drop the configured test database or delete its collections; never run that against a user database.

Size profiles are single-user data in this prototype; there is no account authentication or multi-user isolation. `WEAVE_PROFILE_ENCRYPTION_KEY` is mandatory: it must be canonical base64 for exactly 32 bytes. AES-256-GCM is used with a fresh IV per update; startup fails rather than storing measurements in plaintext. If a legacy plaintext profile exists, reads fail safely and it must be migrated or removed explicitly. Do not commit keys, `.env`, or real data.

Reminder reconciliation uses a unique `(wishlist_item_id, calendar_event_id, reminder_window)` constraint. It updates event dates for active reminders, preserves dismissed/completed/cancelled states, removes reminders for archived/deleted items and past events, and supports 30-, 14-, and 7-day windows. This is on-demand reconciliation when Weave is asked; background notifications and schedulers are not implemented.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `NVIDIA_API_KEY` | none | Enables the NVIDIA planner. |
| `NVIDIA_MODEL` | `openai/gpt-oss-20b` | NVIDIA NIM model used for function calling. This model is listed in NVIDIA's hosted API catalog as supporting function calling. |
| `NVIDIA_VISION_MODEL` | `NVIDIA_MODEL`, else `nvidia/nemotron-3.5-super-vl-120b-a12b` | Model used to read document images; image input is verified before use. |
| `NVIDIA_VISION_MAX_TOKENS` | `8192` | Token budget for document extraction (one retry at double the budget if a reasoning model emits no answer). |
| `APPLIANCE_REMINDER_WINDOWS` | `30,14,7` | Days before a deadline to generate appliance reminders. |
| `APPLIANCE_EMI_MONTHS_AHEAD` | `6` | Months of recurring EMI occurrences to materialise. |
| `WEAVE_UPLOAD_DIR` | `backend/uploads/appliances` | Private directory for original documents. |
| `WEAVE_MAX_UPLOAD_BYTES` | `15728640` (15 MB) | Upload size limit. |
| `WEAVE_OCR_LANG` / `WEAVE_TESSERACT_LANG_PATH` | `eng` / Tesseract default | OCR language and optional local traineddata directory. |
| `WEAVE_MODE` | `nvidia` if a key is found, else `offline` | Starting planner (`nvidia` or `offline`). |
| `WEAVE_TODAY` | today | Pin "today" (YYYY-MM-DD) for a repeatable demo. |
| `WEAVE_STATEMENT_CSV` | `data/statement.csv` (relative to `backend/`) | Statement file for the Money server. |
| `MONGODB_URI` | none | Required MongoDB connection string (`mongodb://127.0.0.1:27017/weave` for local Compass or Atlas URI). |
| `MONGODB_DB_NAME` | URI-selected database | Optional database name passed to Mongoose. |
| `WEAVE_PROFILE_ENCRYPTION_KEY` | none | Required base64-encoded 32-byte AES-256-GCM key for size-profile encryption. |
| `PORT` | `4321` | Server port. |

NVIDIA requests use the official OpenAI JavaScript SDK with base URL `https://integrate.api.nvidia.com/v1`, a 30-second timeout, and one SDK retry. API keys are read server-side only and are never included in status responses, activity logs, or frontend payloads.

### NVIDIA setup

Create an NVIDIA API key from the [NVIDIA hosted API catalog](https://build.nvidia.com/openai/gpt-oss-20b?nim=hosted), copy `backend/.env.example` to `backend/.env`, and set `NVIDIA_API_KEY`. The default `openai/gpt-oss-20b` model is documented in NVIDIA's catalog as supporting function calling; set `NVIDIA_MODEL` to another catalog model available to your key if needed. Restart Weave after changing the environment.

### MongoDB setup (Local Compass or Atlas)

**Local MongoDB / Compass (configured in `backend/.env`):**
1. Ensure local MongoDB Server is running (`mongodb://127.0.0.1:27017`) and open `mongodb://127.0.0.1:27017/weave` in MongoDB Compass to inspect collections.
2. In `backend/.env`, set `MONGODB_URI=mongodb://127.0.0.1:27017/weave` and `MONGODB_DB_NAME=weave` (plus optional `WEAVE_PROFILE_ENCRYPTION_KEY`).
3. Start Weave with `npm start` (or `npm run dev`).

**MongoDB Atlas (optional cloud alternative):**
1. Create an Atlas project, database user, and Network Access allowlist entry.
2. Set `MONGODB_URI=mongodb+srv://...` in `backend/.env` and restart.

Mongoose creates the `wishlistitems`, `sizeprofiles`, `reminders`, `appliances`, `appliance_documents`, `appliance_deadlines`, and `appliance_reminders` collections and their indexes cleanly in either local MongoDB or Atlas. Occasion reminder statuses are `suggested`, `pending_approval`, `approved`, `dismissed`, `completed`, and `cancelled`; appliance reminder statuses are `suggested`, `approved`, `dismissed`, `completed`, and `cancelled`. Reconciliation is on demand; there is no background notification scheduler or push delivery.

This phase does not automatically migrate an existing SQLite file into Atlas. Existing Atlas data is preserved and sample documents are inserted only into empty collections; any SQLite-to-Atlas migration should be an explicit, reviewed data operation.

### Adding a real app

Any MCP server can replace a sample one: add it to `SERVER_DEFS` in `backend/src/hub.js` with the command that starts it. Weave discovers its tools automatically. A tool that isn't marked read-only always goes through the approval gate. Real accounts need that server's own sign-in (usually OAuth), which this prototype doesn't include.

## Credits

Fonts: Newsreader, Schibsted Grotesk and IBM Plex Mono (SIL Open Font License, see `frontend/fonts`). Icons: Lucide (ISC License).
