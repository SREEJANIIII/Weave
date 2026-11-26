import crypto from 'node:crypto';
import { ApplianceDeadline } from '../models/appliance-deadline.js';
import { addDays, addMonths, isoDate } from '../lib/dates.js';

const record = (x) =>
  x
    ? {
        ...x,
        id: x._id ?? x.id,
        kind: 'appliance_deadline',
        created_at: x.createdAt,
        updated_at: x.updatedAt,
      }
    : null;

/** Expand a recurring EMI/payment rule into individual dated occurrences. */
export function expandRecurrence(deadline, { monthsAhead = 6, today = isoDate(new Date()) } = {}) {
  const recurrence = deadline.recurrence;
  if (!recurrence || !['monthly', 'yearly'].includes(recurrence.frequency) || !deadline.dueDate) return [];
  const step = recurrence.frequency === 'monthly' ? 1 : 12;
  const limit = Math.min(Math.max(Number(monthsAhead) || 6, 1), 60);
  const start = new Date(`${deadline.dueDate}T00:00:00`);
  const out = [];
  for (let i = 0; i < limit; i += 1) {
    const date = addMonths(start, i * step);
    const dueDate = isoDate(date);
    if (dueDate < today) continue;
    if (recurrence.endDate && dueDate > recurrence.endDate) break;
    out.push({ ...deadline, dueDate, occurrenceKey: `${deadline.applianceId}:${deadline.type}:${dueDate.slice(0, 7)}` });
  }
  return out;
}

export class ApplianceDeadlineRepository {
  async get(id) {
    return record(await ApplianceDeadline.findById(String(id)).lean());
  }

  async listForAppliance(applianceId, { status = 'active', type = null, limit = 100 } = {}) {
    const filter = { applianceId };
    if (status && status !== 'all') filter.status = status;
    if (type) filter.type = type;
    return (await ApplianceDeadline.find(filter).sort({ dueDate: 1 }).limit(Math.min(Math.max(Number(limit) || 100, 1), 200)).lean()).map(record);
  }

  async upcoming({ withinDays = 365, type = null, today = isoDate(new Date()), limit = 100 } = {}) {
    const end = isoDate(addDays(new Date(`${today}T00:00:00`), Math.max(Number(withinDays) || 365, 0)));
    const filter = { status: 'active', confirmed: true, dueDate: { $gte: today, $lte: end } };
    if (type) filter.type = type;
    return (await ApplianceDeadline.find(filter).sort({ dueDate: 1, type: 1 }).limit(Math.min(Math.max(Number(limit) || 100, 1), 200)).lean()).map(record);
  }

  async upsert(input) {
    if (!input?.occurrenceKey) return null;
    const set = {
      applianceId: input.applianceId,
      sourceDocumentId: input.sourceDocumentId ?? null,
      type: input.type,
      title: input.title,
      dueDate: input.dueDate,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      recurrence: input.recurrence ?? null,
      confirmed: input.confirmed !== false,
      notes: input.notes ?? null,
    };
    if (input.status) set.status = input.status;
    const doc = await ApplianceDeadline.findOneAndUpdate({ occurrenceKey: input.occurrenceKey }, { $set: set, $setOnInsert: { _id: `dl_${crypto.randomUUID().slice(0, 8)}`, occurrenceKey: input.occurrenceKey } }, { returnDocument: 'after', upsert: true, runValidators: true }).lean();
    return record(doc);
  }

  async update(id, changes = {}) {
    const allowed = ['title', 'dueDate', 'amount', 'currency', 'status', 'notes', 'recurrence'];
    const set = {};
    for (const key of allowed) if (changes[key] !== undefined) set[key] = changes[key] === '' ? null : changes[key];
    if (!Object.keys(set).length) return this.get(id);
    return record(await ApplianceDeadline.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after', runValidators: true }).lean());
  }

  async cancelMissing(applianceId, validKeys, sourceDocumentId = null) {
    const filter = { applianceId, status: 'active', occurrenceKey: { $nin: validKeys } };
    if (sourceDocumentId) filter.sourceDocumentId = sourceDocumentId;
    await ApplianceDeadline.updateMany(filter, { $set: { status: 'cancelled' } });
  }
}
