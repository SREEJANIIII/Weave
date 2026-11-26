import crypto from 'node:crypto';
import { Appliance } from '../models/appliance.js';
import { dedupeKey } from '../lib/appliance-fields.js';

const record = (x) =>
  x
    ? {
        ...x,
        id: x._id ?? x.id,
        kind: 'appliance',
        created_at: x.createdAt,
        updated_at: x.updatedAt,
      }
    : null;

// Only these fields may be persisted from a confirmation or a tool call.
const WRITABLE = ['name', 'brand', 'model', 'serialNumber', 'purchaseDate', 'price', 'currency', 'warrantyMonths', 'serviceDetails', 'amcProvider', 'notes'];

export class ApplianceRepository {
  async list({ query = '', limit = 25 } = {}) {
    const q = String(query ?? '').trim();
    const filter = q
      ? { $or: ['name', 'brand', 'model', 'serialNumber'].map((field) => ({ [field]: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) }
      : {};
    return (await Appliance.find(filter).sort({ name: 1, _id: 1 }).limit(Math.min(Math.max(Number(limit) || 25, 1), 100)).lean()).map(record);
  }

  async get(id) {
    return record(await Appliance.findById(String(id)).lean());
  }

  /** Find-or-create by documented identity, so linking a second bill never duplicates an appliance. */
  async findOrCreate(fields = {}, { sourceDocumentId = null } = {}) {
    const key = dedupeKey(fields);
    if (!key) return null;
    const existing = await Appliance.findOne({ dedupeKey: key });
    if (existing) return record(existing.toObject());
    const id = `appl_${crypto.randomUUID().slice(0, 8)}`;
    const updates = {};
    for (const field of WRITABLE) if (fields[field] !== undefined && fields[field] !== null && fields[field] !== '') updates[field] = fields[field];
    try {
      return record((await Appliance.create({ _id: id, dedupeKey: key, ...updates, confirmedFields: Object.keys(updates), sourceDocumentIds: sourceDocumentId ? [sourceDocumentId] : [] })).toObject());
    } catch (error) {
      if (error.code !== 11000) throw error;
      return record((await Appliance.findOne({ dedupeKey: key })).toObject());
    }
  }

  async update(id, changes = {}, { sourceDocumentId = null } = {}) {
    const set = {};
    for (const field of WRITABLE) if (changes[field] !== undefined) set[field] = changes[field] === '' ? null : changes[field];
    const confirmed = Array.isArray(changes.confirmedFields) ? changes.confirmedFields.filter((f) => WRITABLE.includes(f)) : [];
    if (confirmed.length) {
      const current = await Appliance.findById(id);
      set.confirmedFields = [...new Set([...(current?.confirmedFields ?? []), ...confirmed])];
    }
    const doc = await Appliance.findByIdAndUpdate(id, { $set: set, ...(sourceDocumentId ? { $addToSet: { sourceDocumentIds: sourceDocumentId } } : {}) }, { returnDocument: 'after', runValidators: true }).lean();
    return record(doc);
  }

  async setStatus(id, status) {
    return record(await Appliance.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' }).lean());
  }
}
