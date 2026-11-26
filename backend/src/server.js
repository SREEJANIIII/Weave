// Weave entrypoint: connect to MongoDB, start the MCP apps, then serve the UI and API with Express.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { Hub } from './hub.js';
import { ProposalStore } from './run.js';
import { hasCredentials, MODEL } from './agent-nvidia.js';
import { connectDatabase, closeDatabase } from '../db/database.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4321;
const HOST = '127.0.0.1';

const hub = new Hub(root);
const proposals = new ProposalStore();
const state = {
  mode: ['nvidia', 'offline'].includes(process.env.WEAVE_MODE) ? process.env.WEAVE_MODE : hasCredentials() ? 'nvidia' : 'offline',
};

async function main() {
  if (!process.env.MONGODB_URI) {
    console.log('  Database  not set up: MONGODB_URI is empty in backend/.env, so services that store data show as "not set up".');
    console.log('            Set it to your MongoDB (e.g. mongodb://127.0.0.1:27017/weave) and restart to turn them on.');
  } else try {
    await connectDatabase();
    console.log('  Database  MongoDB connected');
  } catch (err) {
    console.error('\n  Weave cannot start: MongoDB connection failed.');
    console.error(`  ${err.message}`);
    console.error('  Configure MONGODB_URI (e.g. mongodb://127.0.0.1:27017/weave) in backend/.env, then restart.\n');
    process.exit(1);
  }

  try {
    await hub.start();
  } catch (err) {
    console.error('\n  Weave cannot start: MCP apps failed to initialize.');
    console.error(`  ${err.message}\n`);
    await closeDatabase().catch(() => {});
    process.exit(1);
  }

  const app = createApp({ root, hub, proposals, state, port: PORT });
  const server = app.listen(PORT, HOST, () => {
    const apps = hub.status().map((a) => `${a.id} (${a.status === 'connected' ? `${a.tools.length} tools` : a.status})`).join(', ');
    console.log(`\n  Weave prototype  →  http://localhost:${PORT}\n`);
    console.log(`  Planner   ${state.mode === 'nvidia' ? `NVIDIA (${MODEL})` : 'Offline script'}${hasCredentials() ? '' : '  ·  no NVIDIA credentials found'}`);
    console.log(`  MCP apps  ${apps}\n`);
  });
  server.on('error', (err) => {
    console.error(`\n  Weave could not listen on ${HOST}:${PORT}: ${err.message}\n`);
    process.exit(1);
  });

  let shuttingDown = false;
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n  ${sig} received; shutting down...`);
      server.close(async () => {
        try {
          await hub.stop();
          await closeDatabase();
          console.log('  Shutdown complete.\n');
          process.exit(0);
        } catch (err) {
          console.error('[shutdown]', err);
          process.exit(1);
        }
      });
      setTimeout(() => {
        console.error('[shutdown] timed out waiting for connections to close');
        process.exit(1);
      }, 10_000).unref();
    });
  }
}

await main();
