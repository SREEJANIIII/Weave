import { SavedPaper } from '../models/saved-paper.js';

const MAX_TEXT = 60_000;
const MAX_TABLES = 20;

function toItem(doc) {
  if (!doc) return null;
  const { _id, original, createdAt, updatedAt, ...rest } = doc;
  return { id: _id, ...rest, hasOriginal: Boolean(original?.data) || Boolean(doc.hasOriginal) };
}

/** Keep stored content tidy: strings only, bounded sizes, rectangular-ish tables. */
export function cleanContent(content) {
  if (!content || typeof content !== 'object') return null;
  const str = (v) => (v == null ? '' : String(v)).trim();
  const tables = (Array.isArray(content.tables) ? content.tables : []).slice(0, MAX_TABLES).map((t) => ({
    title: str(t?.title).slice(0, 200),
    columns: (Array.isArray(t?.columns) ? t.columns : []).slice(0, 30).map((c) => str(c).slice(0, 200)),
    rows: (Array.isArray(t?.rows) ? t.rows : []).slice(0, 300).map((r) => (Array.isArray(r) ? r : [r]).slice(0, 30).map((c) => str(c).slice(0, 400))),
  })).filter((t) => t.rows.length || t.columns.length);
  const text = str(content.text).slice(0, MAX_TEXT);
  if (!text && !tables.length) return null;
  return { text, tables, method: str(content.method).slice(0, 40), readAt: str(content.readAt) || new Date().toISOString() };
}

function toDoc(item) {
  const original = item.original?.data && item.original?.mediaType ? { data: String(item.original.data), mediaType: String(item.original.mediaType) } : undefined;
  return {
    _id: String(item.id),
    kind: String(item.kind || 'other'),
    title: String(item.title || 'Untitled').slice(0, 200),
    fields: item.fields && typeof item.fields === 'object' ? item.fields : {},
    image: typeof item.image === 'string' ? item.image : null,
    ...(original ? { original } : {}),
    fileName: String(item.fileName || ''),
    source: String(item.source || 'typed'),
    sample: Boolean(item.sample),
    savedAt: String(item.savedAt || new Date().toISOString()),
    content: cleanContent(item.content),
  };
}

export class SavedPaperRepository {
  async list() {
    const docs = await SavedPaper.find({}).select('+original').sort({ savedAt: -1 }).lean();
    // Report whether an original exists without sending its bytes to the browser.
    return docs.map((d) => toItem({ ...d, original: d.original?.data ? { data: '1' } : null }));
  }

  async get(id, { withOriginal = false } = {}) {
    const doc = await SavedPaper.findById(String(id)).select('+original').lean();
    if (!doc) return null;
    const item = toItem({ ...doc, original: doc.original?.data ? { data: '1' } : null });
    return withOriginal ? { ...item, original: doc.original ?? null } : item;
  }

  /** Save, then read back: the caller only reports "saved" when this returns the stored item. */
  async save(item) {
    const doc = toDoc(item);
    await SavedPaper.replaceOne({ _id: doc._id }, doc, { upsert: true });
    return this.get(doc._id);
  }

  /** Add papers that are not stored yet (used to move papers out of the browser). */
  async importMissing(items) {
    const existing = new Set((await SavedPaper.find({}, { _id: 1 }).lean()).map((d) => d._id));
    const fresh = items.filter((it) => it?.id && !existing.has(String(it.id))).map(toDoc);
    if (fresh.length) await SavedPaper.insertMany(fresh, { ordered: false });
    return fresh.length;
  }

  async replaceAll(items) {
    await SavedPaper.deleteMany({});
    if (items.length) await SavedPaper.insertMany(items.map(toDoc), { ordered: false });
  }

  async setContent(id, content) {
    const clean = cleanContent(content);
    await SavedPaper.updateOne({ _id: String(id) }, { $set: { content: clean } });
    return this.get(id);
  }

  async remove(id) {
    const res = await SavedPaper.deleteOne({ _id: String(id) });
    return res.deletedCount > 0;
  }
}
