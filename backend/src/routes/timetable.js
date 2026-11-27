import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { TimetableDocument } from '../../models/timetable-document.js';
import { TimetableEntry } from '../../models/timetable-entry.js';
import { sniffFile, extractSource } from '../../lib/document-pipeline.js';
import { extractTimetableEntries, looksLikeTimetable } from '../../lib/timetable-extraction.js';

const owner = (req) => String(req.get('x-weave-user') || 'default').trim().slice(0, 128) || 'default';
const publicDocument = (doc) => { const x = doc.toObject ? doc.toObject() : doc; const { ownerId, ...rest } = x; return rest; };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)) });

export function createTimetableRouter({ hub }) {
  const router = Router();
  const guard = (res) => { if (hub.isAvailable('timetable')) return false; res.status(503).json({ error: 'Timetable is switched off or unavailable.' }); return true; };

  router.post('/upload', (req, res, next) => upload.single('file')(req, res, (error) => error ? res.status(400).json({ error: error.message }) : next()), async (req, res) => {
    if (guard(res)) return;
    if (!req.file) return res.status(400).json({ error: 'Choose a timetable PDF.' });
    let sniffed;
    try { sniffed = sniffFile(req.file.buffer, req.file.mimetype, req.file.originalname); } catch (error) { return res.status(400).json({ error: error.message }); }
    if (sniffed.mimeType !== 'application/pdf') return res.status(400).json({ error: 'Timetables must be PDF files.' });
    const ownerId = owner(req); const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const duplicate = await TimetableDocument.findOne({ ownerId, sha256 });
    if (duplicate) return res.status(409).json({ error: 'This timetable was already uploaded.', document: publicDocument(duplicate) });
    try {
      const source = await extractSource({ buffer: req.file.buffer, mimeType: 'application/pdf', kind: 'timetable' });
      if (!source.text || !looksLikeTimetable(source.text)) return res.status(422).json({ error: 'No timetable rows could be identified. Upload a readable timetable PDF.' });
      const id = `timetable_${crypto.randomUUID()}`;
      const entries = extractTimetableEntries(source.text).map((entry) => ({ ...entry, sourceDocumentId: id }));
      const document = await TimetableDocument.create({ _id: id, ownerId, originalName: String(req.file.originalname).slice(0, 200), sha256, mimeType: 'application/pdf', rawText: source.text.slice(0, 100000), extractedEntries: entries, status: 'pending_review' });
      return res.status(201).json({ document: publicDocument(document), entries });
    } catch (error) { return res.status(422).json({ error: `Timetable extraction failed: ${error.message}` }); }
  });

  router.get('/documents', async (req, res) => { if (guard(res)) return; const docs = await TimetableDocument.find({ ownerId: owner(req) }).sort({ createdAt: -1 }).lean(); res.json({ documents: docs.map(publicDocument) }); });
  router.post('/documents/:id/confirm', async (req, res) => {
    if (guard(res)) return;
    const ownerId = owner(req); const document = await TimetableDocument.findOne({ _id: req.params.id, ownerId });
    if (!document) return res.status(404).json({ error: 'Timetable document not found.' });
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : document.extractedEntries;
    const clean = entries.map((item) => ({ ...item, sourceDocumentId: document._id })).filter((item) => item.day && item.startTime && item.endTime && item.subject).map((item) => ({ _id: `class_${crypto.randomUUID()}`, ownerId, timetableDocumentId: document._id, day: item.day, startTime: item.startTime, endTime: item.endTime, subject: String(item.subject).trim(), classType: String(item.classType ?? '').trim(), location: String(item.location ?? '').trim(), sourceDocumentId: document._id }));
    if (!clean.length) return res.status(400).json({ error: 'Confirm at least one complete timetable entry.' });
    await TimetableEntry.deleteMany({ ownerId, timetableDocumentId: document._id });
    await TimetableEntry.insertMany(clean, { ordered: true });
    document.status = 'confirmed'; document.extractedEntries = clean.map(({ ownerId: ignored, _id, timetableDocumentId, ...item }) => ({ id: _id, ...item })); await document.save();
    return res.json({ document: publicDocument(document), entries: clean.map(({ ownerId: ignored, ...item }) => item) });
  });
  router.get('/entries', async (req, res) => { if (guard(res)) return; const entries = await TimetableEntry.find({ ownerId: owner(req) }).sort({ day: 1, startTime: 1 }).lean(); res.json({ entries: entries.map((entry) => { const { ownerId, _id, ...item } = entry; return { id: _id, ...item }; }) }); });
  return router;
}
