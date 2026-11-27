// Saved papers in MongoDB: receipts, warranties, bills, timetables and notes, with the text read from them.
import { Router } from 'express';
import { SavedPaperRepository } from '../../repositories/saved-paper-repository.js';
import { answerFromPaper } from '../../lib/paper-answer.js';
import { readDocument } from '../reader.js';
import { hasCredentials } from '../agent-nvidia.js';

export function createPapersRouter({ state }) {
  const router = Router();
  const repo = new SavedPaperRepository();
  const modelReady = () => state.mode === 'nvidia' && hasCredentials();

  router.get('/', async (req, res) => res.json({ items: await repo.list() }));

  // Save one paper and return it as read back from the database.
  router.post('/', async (req, res) => {
    const item = req.body?.item;
    if (!item?.id || !item?.title) return res.status(400).json({ error: 'A saved paper needs a name.' });
    const saved = await repo.save(item);
    if (!saved) return res.status(500).json({ error: 'It didn’t stick when Weave checked. Nothing was saved.' });
    return res.status(201).json({ item: saved });
  });

  // Move papers kept in the browser into the database (only ones not stored yet).
  router.post('/import', async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const imported = await repo.importMissing(items);
    return res.json({ imported, items: await repo.list() });
  });

  // "Reset sample data": replace every saved paper with the samples the browser sends.
  router.post('/reset', async (req, res) => {
    await repo.replaceAll(Array.isArray(req.body?.items) ? req.body.items : []);
    return res.json({ items: await repo.list() });
  });

  router.delete('/:id', async (req, res) => {
    const removed = await repo.remove(req.params.id);
    return removed ? res.json({ ok: true }) : res.status(404).json({ error: 'That paper isn’t saved.' });
  });

  // Read (or re-read) the full text of a stored photo or PDF.
  router.post('/:id/read', async (req, res) => {
    if (!modelReady()) return res.status(409).json({ error: 'Reading needs the NVIDIA model to be selected and its API key set.' });
    const paper = await repo.get(req.params.id, { withOriginal: true });
    if (!paper) return res.status(404).json({ error: 'That paper isn’t saved.' });
    if (!paper.original?.data) return res.status(409).json({ error: 'Only a small preview of this paper was kept, so it can’t be read again. Add the photo again to read it.' });
    try {
      const { content } = await readDocument({ data: paper.original.data, mediaType: paper.original.mediaType, fileName: paper.fileName });
      if (!content) return res.status(422).json({ error: 'No text could be read from this paper.' });
      return res.json({ item: await repo.setContent(paper.id, content) });
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Reading failed.' });
    }
  });

  // Answer a question from one paper's stored text, as a headline plus a table or short points.
  router.post('/:id/answer', async (req, res) => {
    const question = String(req.body?.question ?? '').trim().slice(0, 600);
    if (!question) return res.status(400).json({ error: 'Ask a question first.' });
    const paper = await repo.get(req.params.id);
    if (!paper) return res.status(404).json({ error: 'That paper isn’t saved.' });
    if (!paper.content?.text && !paper.content?.tables?.length) {
      return res.status(409).json({ error: 'Weave hasn’t read the text of this paper yet.' });
    }
    return res.json({ answer: await answerFromPaper(paper, question, { useModel: modelReady() }) });
  });

  return router;
}
