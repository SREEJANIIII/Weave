// HTTP surface for appliance uploads/review. Reads and writes of saved records go
// through the Appliances MCP server, so they appear in the activity feed and keep the
// same approval/citation rules as the other apps. Upload bytes never leave the backend.
import { Router } from 'express';
import multer from 'multer';
import { ApplianceService } from '../../services/appliance-service.js';
import { ApplianceRepository } from '../../repositories/appliance-repository.js';
import { ApplianceDocumentRepository } from '../../repositories/appliance-document-repository.js';
import { ApplianceDeadlineRepository } from '../../repositories/appliance-deadline-repository.js';
import { ApplianceReminderRepository } from '../../repositories/appliance-reminder-repository.js';
import { parseWindows } from '../../lib/appliance-fields.js';
import { saveUpload, readUpload, deleteUpload } from '../../lib/appliance-uploads.js';
import { sniffFile } from '../../lib/document-pipeline.js';
import { extractApplianceDocument } from '../../lib/appliance-extraction.js';

const MAX_UPLOAD_BYTES = Number(process.env.WEAVE_MAX_UPLOAD_BYTES) || 15 * 1024 * 1024;
const DOC_KINDS = ['bill', 'warranty', 'service', 'amc', 'emi', 'return', 'other'];

export function createAppliancesRouter({ hub }) {
  const router = Router();
  const documents = new ApplianceDocumentRepository();
  const service = new ApplianceService({
    appliances: new ApplianceRepository(),
    documents,
    deadlines: new ApplianceDeadlineRepository(),
    reminders: new ApplianceReminderRepository(),
    windows: parseWindows(process.env.APPLIANCE_REMINDER_WINDOWS),
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8, parts: 12 },
    fileFilter(req, file, callback) {
      const name = String(file.originalname ?? '').toLowerCase();
      if (!/\.(pdf|png|jpe?g)$/.test(name) || !['application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream'].includes(file.mimetype)) {
        return callback(new Error('Only PDF, JPG, JPEG and PNG files are accepted.'));
      }
      callback(null, true);
    },
  });
  const guard = (res) => {
    if (hub.isAvailable('appliances')) return false;
    res.status(503).json({ error: 'Appliances & Bills is switched off or unavailable.' });
    return true;
  };
  const call = async (res, tool, args, summary) => {
    const result = await hub.call('appliances', tool, args, { summary });
    if (result.isError) {
      res.status(400).json({ error: result.text });
      return null;
    }
    return result.data;
  };

  router.post('/documents', (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? `File is too large (limit ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).` : error.message });
      next();
    });
  }, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a PDF, JPG, JPEG or PNG file to upload.' });
    const kind = DOC_KINDS.includes(req.body?.kind) ? req.body.kind : 'other';
    const handwritten = ['true', '1', 'yes'].includes(String(req.body?.handwritten ?? '').toLowerCase());
    let file;
    try {
      file = sniffFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    let storedName;
    try {
      storedName = await saveUpload(req.file.buffer, file.ext);
      let extraction = { method: null, warnings: [], fields: {}, deadlines: [] };
      let error = null;
      try {
        extraction = await extractApplianceDocument({
          buffer: req.file.buffer,
          mimeType: file.mimeType,
          kind: handwritten ? 'handwritten' : kind,
        });
      } catch (extractError) {
        // Keep the original and an empty extraction: the user can still enter the
        // documented values by hand. Nothing is guessed when AI reading fails.
        error = extractError.message;
        console.error('[appliances/upload]', extractError);
      }
      const document = await documents.create({
        kind,
        originalName: String(req.file.originalname).slice(0, 200),
        mimeType: file.mimeType,
        size: req.file.buffer.length,
        storedName,
        status: 'pending_review',
        extraction,
        error,
      });
      return res.status(201).json({ document, extraction, warning: error });
    } catch (error) {
      if (storedName) await deleteUpload(storedName);
      console.error('[appliances/upload]', error);
      return res.status(422).json({ error: error.message });
    }
  });

  // Private preview: only a stored document id can resolve to bytes.
  router.get('/documents/:id/file', async (req, res) => {
    const doc = await documents.getStored(req.params.id);
    if (!doc) return res.status(404).json({ error: 'No such document.' });
    try {
      const bytes = await readUpload(doc.storedName);
      res.set({ 'Content-Type': doc.mimeType, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="${String(doc.originalName).replace(/[^\w.\- ]/g, '_')}"` });
      return res.send(bytes);
    } catch {
      return res.status(404).json({ error: 'The original file is no longer available.' });
    }
  });

  router.get('/documents', async (req, res) => {
    if (guard(res)) return;
    const { applianceId, status, limit } = req.query;
    const data = await call(res, 'get_appliance_documents', { applianceId, status, limit: limit ? Number(limit) : undefined }, 'loaded appliance documents');
    if (data) res.json(data);
  });

  router.post('/documents/:id/confirm', async (req, res) => {
    if (guard(res)) return;
    const { fields, deadlines, applianceId } = req.body ?? {};
    const data = await call(res, 'confirm_appliance_document', { documentId: req.params.id, fields, deadlines, applianceId }, 'confirmed reviewed appliance document');
    if (data) res.json(data);
  });

  router.delete('/documents/:id', async (req, res) => {
    if (guard(res)) return;
    const data = await call(res, 'delete_appliance_document', { id: req.params.id }, 'deleted an appliance document and linked records');
    if (data) res.json(data);
  });

  router.get('/deadlines/upcoming', async (req, res) => {
    if (guard(res)) return;
    const { withinDays, type } = req.query;
    const data = await call(res, 'get_upcoming_deadlines', { withinDays: withinDays ? Number(withinDays) : undefined, type }, 'loaded upcoming appliance deadlines');
    if (data) res.json(data);
  });

  router.patch('/deadlines/:id', async (req, res) => {
    if (guard(res)) return;
    const { dueDate } = req.body ?? {};
    const data = await call(res, 'update_appliance_deadline', { id: req.params.id, dueDate }, 'updated a confirmed appliance deadline');
    if (data) res.json(data);
  });

  router.get('/reminders', async (req, res) => {
    if (guard(res)) return;
    const { applianceId, status } = req.query;
    const data = await call(res, 'list_appliance_reminders', { applianceId, status }, 'loaded appliance reminders');
    if (data) res.json(data);
  });

  router.post('/reminders/:id/:action', async (req, res) => {
    if (guard(res)) return;
    const status = { dismiss: 'dismissed', approve: 'approved', complete: 'completed' }[req.params.action];
    if (!status) return res.status(404).json({ error: 'Unknown reminder action.' });
    const data = await call(res, 'update_appliance_reminder', { id: req.params.id, status }, `updated appliance reminder to ${status}`);
    if (data) res.json(data);
  });

  router.post('/deadlines/:id/complete', async (req, res) => {
    if (guard(res)) return;
    const data = await call(res, 'update_appliance_deadline', { id: req.params.id, status: 'completed' }, 'completed appliance deadline');
    if (data) res.json(data);
  });

  router.get('/', async (req, res) => {
    if (guard(res)) return;
    const data = await call(res, 'search_appliances', { query: req.query.query, limit: req.query.limit ? Number(req.query.limit) : undefined }, 'loaded appliances');
    if (data) res.json(data);
  });

  router.get('/:id', async (req, res) => {
    if (guard(res)) return;
    const data = await call(res, 'get_appliance', { id: req.params.id }, 'loaded appliance details');
    if (data) res.json(data);
  });

  router.patch('/:id', async (req, res) => {
    if (guard(res)) return;
    const data = await call(res, 'update_appliance', { id: req.params.id, ...(req.body ?? {}) }, 'updated appliance information');
    if (data) res.json(data);
  });

  return router;
}
