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

## Run it

Needs Node 22 or later.

```bash
npm install
npm start
```

Open <http://localhost:4321>.

- **Offline planner** (default when no key is found): a fixed script for the two demo questions. It makes the same real MCP calls and follows the same rules, but the reasoning is hand-written, so it only understands those two questions. Use it if the venue Wi-Fi is unreliable.
- **Claude planner**: set a key, restart, and pick *Claude* in the top bar. Claude chooses which MCP tools to call and writes the cited answer.

```bash
cp .env.example .env               # then put your key in .env (or: ant auth login)
npm start
```

Check everything still works end to end (offline, about 5 seconds):

```bash
npm run smoke
```

## What's real and what isn't

| Part | Status |
|---|---|
| MCP protocol: client, `tools/list`, `tools/call`, tool annotations | **Real**, using the official `@modelcontextprotocol/sdk` over stdio |
| Calendar, Notes, Tasks and Money servers | **Real MCP servers, sample data.** The data is generated relative to today so the demo works on any day. Nothing connects to a real account. |
| Money | Reads `data/statement.csv` if you add one (format in `data/statement.example.csv`); otherwise a sample statement. Never connects to a bank or UPI app. |
| Approval gate | **Real.** Any tool not marked `readOnlyHint: true` is held as a draft; it runs only after you approve, then Weave reads the record back before saying "Done". |
| Claude planner | Built on the Anthropic SDK's tool runner with `claude-opus-5-5`. **Not tested against the live API on this machine** (no key was available). The offline path is fully tested. |
| Email, fitness apps, travel, learning, home | **Planned.** Shown as planned in the app and not connected. |

## Demo script (about 2 minutes)

1. Point at the left rail: four MCP servers, the tools each one exposes, and which ones *ask first*.
2. Ask *"What should I follow up on today, and when can I fit in a workout?"* and watch the MCP calls stream in.
3. Hover a citation number: the matching record lights up on the right.
4. Open **Edit** on the run, move it to 6:30, then **Approve**. The card says it was added and read back from the calendar. Open **MCP activity** to show the held write, the approval and the read-back.
5. Ask the same question again: the task isn't drafted twice, and the run shows as already booked.
6. Switch **Tasks** off and ask again: Weave says what it couldn't check instead of guessing.
7. Ask *"How much did I spend on food last week, and what was happening on those days?"* and note the caveat: the calendar is context, not the cause.
8. **Reset demo** restores the sample data.

## How it fits together

| Path | What it does |
|---|---|
| `mcp-servers/*.js` | Four MCP servers (`McpServer` + stdio). Tools carry MCP annotations: reads are `readOnlyHint: true`; `create_task` and `create_event` are not. |
| `src/hub.js` | Weave's MCP client. Spawns each server, discovers tools, calls them, and logs every message for the activity panel. |
| `src/run.js` | One question = one run. Reads register citable sources, writes become drafts, and the answer may only cite records that were actually read. |
| `src/agent-claude.js` | Claude planner: each MCP tool becomes a tool for the SDK's tool runner; write tools only create drafts. The final answer comes back through a strict `present_answer` tool. |
| `src/agent-offline.js` | Offline planner for the two demo questions. |
| `src/server.js` | Local HTTP server (127.0.0.1 only): the UI, a streaming `/api/ask`, approve/dismiss, app switches, reset. |
| `web/` | The interface. Plain HTML, CSS and JS modules; no build step. |

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Enables the Claude planner (an `ant auth login` profile also works). |
| `WEAVE_MODE` | `claude` if a key is found, else `offline` | Starting planner. |
| `WEAVE_MODEL` | `claude-opus-5-5` | Model for the Claude planner. |
| `WEAVE_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh` or `max`. |
| `WEAVE_TODAY` | today | Pin "today" (YYYY-MM-DD) for a repeatable demo. |
| `WEAVE_STATEMENT_CSV` | `data/statement.csv` | Statement file for the Money server. |
| `PORT` | `4321` | Server port. |

Claude requests use server-side refusal fallbacks (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta), so if the model declines, the API retries on a fallback model. Remove those two fields in `src/agent-claude.js` to turn this off.

### Adding a real app

Any MCP server can replace a sample one: add it to `SERVER_DEFS` in `src/hub.js` with the command that starts it. Weave discovers its tools automatically. A tool that isn't marked read-only always goes through the approval gate. Real accounts need that server's own sign-in (usually OAuth), which this prototype doesn't include.

## Credits

Fonts: Newsreader, Schibsted Grotesk and IBM Plex Mono (SIL Open Font License, see `web/fonts`). Icons: Lucide (ISC License).
