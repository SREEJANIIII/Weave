import crypto from 'node:crypto';
import { ApplianceDocument } from '../models/appliance-document.js';

// `storedName` is intentionally omitted: the frontend never receives a filesystem path.
const record = (x) => {
  if (!x) return null;
  const { storedName, ...rest } = x.toObject ? x.toObject() : x;
  return { ...rest, id: x._id ?? x.id, kind: 'appliance_document', created_at: x.createdAt, updated_at: x.updatedAt };
};

export class ApplianceDocumentRepository {
  async create(input) {
    const id = `doc_${crypto.randomUUID().slice(0, 12)}`;
    return record((await ApplianceDocument.create({ _id: id, ...input })).toObject());
  }

  async get(id) {
    return record(await ApplianceDocument.findById(String(id)).lean());
  }

  /** Internal only: includes the random stored filename needed to read the private bytes. */
  async getStored(id) {
    return ApplianceDocument.findById(String(id)).lean();
  }

  async list({ applianceId = null, status = null, limit = 50 } = {}) {
    const filter = {};
    if (applianceId) filter.applianceId = applianceId;
    if (status) filter.status = status;
    return (await ApplianceDocument.find(filter).sort({ createdAt: -1 }).limit(Math.min(Math.max(Number(limit) || 50, 1), 100)).lean()).map(record);
  }

  async setExtraction(id, extraction, error = null) {
    return record(await ApplianceDocument.findByIdAndUpdate(id, { $set: { extraction, error } }, { returnDocument: 'after' }).lean());
  }

  async confirm(id, { applianceId, confirmedFields, confirmedAt }) {
    return record(await ApplianceDocument.findByIdAndUpdate(id, { $set: { applianceId, confirmedFields, confirmedAt, status: 'confirmed' } }, { returnDocument: 'after' }).lean());
  }

  async reject(id) {
    return record(await ApplianceDocument.findByIdAndUpdate(id, { $set: { status: 'rejected' } }, { returnDocument: 'after' }).lean());
  }

  async delete(id) {
    return record(await ApplianceDocument.findByIdAndDelete(id).lean());
  }
}
