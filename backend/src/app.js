// Express application: JSON/CORS middleware, the /api router, the built UI and error handling.
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { createApiRouter } from './routes/api.js';
import { createAppliancesRouter } from './routes/appliances.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function allowedOrigin(origin, port) {
  return (
    !origin ||
    origin === `http://localhost:${port}` ||
    origin === `http://127.0.0.1:${port}` ||
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173'
  );
}

export function createApp({ root, hub, proposals, state, port }) {
  const frontendRoot = path.join(root, '..', 'frontend');
  const distRoot = path.join(frontendRoot, 'dist');
  const webRoot = fs.existsSync(path.join(distRoot, 'index.html')) ? distRoot : frontendRoot;
  const app = express();
  app.disable('x-powered-by');

  // The original server sent no-store on every API response; static files override it below.
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // CORS headers for the same origins the prototype has always accepted (including Vite's dev server).
  app.use(cors({
    origin: (origin, callback) => callback(null, allowedOrigin(origin, port)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    preflightContinue: true,
  }));

  // Keep the original cross-origin guard: POST /api/* from any other origin is a 403 JSON error.
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && !allowedOrigin(req.get('origin'), port)) {
      return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    }
    next();
  });

  // JSON body parsing with the same 64 KB ceiling as the old readJson helper.
  app.use('/api', express.json({ limit: '64000b', strict: false }));
  app.use('/api/appliances', createAppliancesRouter({ hub }));
  app.use('/api', createApiRouter({ hub, proposals, state }));

  // Built React app (or the Vite source tree before a build), with the original cache rules.
  app.use(express.static(webRoot, {
    index: 'index.html',
    fallthrough: true,
    setHeaders(res, filePath) {
      const ext = path.extname(filePath);
      const immutable = ext === '.woff2' || filePath.includes(`${path.sep}assets${path.sep}`);
      res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));

  // SPA fallback: extensionless and .html paths resolve to index.html when no file exists.
  app.use((req, res, next) => {
    const ext = path.extname(req.path);
    if (ext && ext !== '.html') return next();
    const index = path.join(webRoot, 'index.html');
    if (!fs.existsSync(index)) return next();
    res.setHeader('Content-Type', TYPES['.html']);
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).sendFile(index);
  });

  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

  // Final error handler: same JSON error shape and 500 status as the old try/catch.
  app.use((err, req, res, next) => {
    console.error('[server]', err);
    if (res.headersSent) return res.end();
    const message = err?.type === 'entity.too.large' ? 'Request too large' : (err?.message ?? 'Internal server error');
    return res.status(500).json({ error: message });
  });

  return app;
}
