// Orchestrates confirmation, deduplication, recurring deadlines and reminder reconciliation.
// Every reminder created here comes from a deadline the user explicitly confirmed.
import { FIELD_DEFS, confirmedFieldValues, dedupeKey, parseAmount, parseDate } from '../lib/appliance-fields.js';
import { isoDate } from '../lib/dates.js';
import { expandRecurrence } from '../repositories/appliance-deadline-repository.js';
import { Appliance } from '../models/appliance.js';
import { ApplianceDocument } from '../models/appliance-document.js';
import { ApplianceDeadline } from '../models/appliance-deadline.js';
import { ApplianceReminder } from '../models/appliance-reminder.js';

export class ApplianceService {
  constructor({ appliances, documents, deadlines, reminders, windows = [30, 14, 7], monthsAhead = 6 }) {
    this.appliances = appliances;
    this.documents = documents;
    this.deadlines = deadlines;
    this.reminders = reminders;
    this.windows = windows;
    this.monthsAhead = monthsAhead;
  }

  async reconcile(applianceId, { windows = this.windows, today = isoDate(new Date()) } = {}) {
    const list = await this.deadlines.listForAppliance(applianceId, { status: 'active' });
    return this.reminders.reconcile(applianceId, list, windows);
  }

  async details(id) {
    const appliance = await this.appliances.get(id);
    if (!appliance) return null;
    const [documents, deadlines, reminders] = await Promise.all([
      this.documents.list({ applianceId: id }),
      this.deadlines.listForAppliance(id, { status: 'active' }),
      this.reminders.list({ applianceId: id }),
    ]);
    return { appliance, documents, deadlines, reminders };
  }

  async upcoming({ withinDays = 365, type = null, today = isoDate(new Date()) } = {}) {
    const [deadlines, reminders] = await Promise.all([
      this.deadlines.upcoming({ withinDays, type, today }),
      this.reminders.listUpcoming({ withinDays, today }),
    ]);
    return { today, deadlines, reminders };
  }

  /** Apply a user's reviewed fields and deadlines; create active reminders only for what they confirmed. */
  async confirmDocument({ documentId, fields = {}, deadlines = [], applianceId = null, today = isoDate(new Date()) }) {
    const doc = await this.documents.get(documentId);
    if (!doc) throw new Error(`No appliance document with id ${documentId}.`);
    if (doc.status !== 'pending_review') throw new Error(`This document is already ${doc.status}.`);

    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields must be an object.');
    for (const key of Object.keys(fields)) if (!FIELD_DEFS[key]) throw new Error(`Unknown appliance field: ${key}.`);
    if (!Array.isArray(deadlines)) throw new Error('deadlines must be an array.');
    const seenIndexes = new Set();
    for (const input of deadlines) {
      if (!input || input.confirmed !== true || !Number.isInteger(input.index) || input.index < 0 || input.index >= (doc.extraction?.deadlines?.length ?? 0)) throw new Error(`Unknown deadline at index ${input?.index}.`);
      if (seenIndexes.has(input.index)) throw new Error(`Deadline at index ${input.index} was submitted more than once.`);
      seenIndexes.add(input.index);
      const source = doc.extraction.deadlines[input.index];
      const date = input.date !== undefined && input.date !== null ? parseDate(input.date) : source.date;
      if (!date) throw new Error(`${source.title} needs a valid, documented date before it can be confirmed.`);
      if (input.amount !== undefined && (parseAmount(input.amount) === null || parseAmount(input.amount).value < 0)) throw new Error(`${source.title} has an invalid amount.`);
      const recurrence = input.recurrence === undefined ? source.recurrence : input.recurrence;
      if (recurrence !== null && recurrence !== undefined) {
        if (!['monthly', 'yearly'].includes(recurrence.frequency)) throw new Error(`${source.title} has an invalid recurrence frequency.`);
        if (recurrence.frequency === 'monthly' && (!Number.isInteger(recurrence.dayOfMonth) || recurrence.dayOfMonth < 1 || recurrence.dayOfMonth > 31)) throw new Error(`${source.title} has an invalid recurrence day.`);
        if (recurrence.endDate && !parseDate(recurrence.endDate)) throw new Error(`${source.title} has an invalid recurrence end date.`);
      }
    }

    const merged = { ...(doc.extraction?.fields ?? {}) };
    const checkedFields = {};
    for (const [key, def] of Object.entries(FIELD_DEFS)) {
      const value = fields[key];
      if (value === undefined || value === null || String(value).trim() === '') continue;
      let normalised = String(value).trim();
      if (def.type === 'date') normalised = parseDate(normalised);
      else if (def.type === 'amount') {
        const amount = parseAmount(normalised);
        normalised = amount?.value ?? null;
        if (amount) merged[key] = { ...(merged[key] ?? {}), currency: amount.currency };
      } else if (def.type === 'number') normalised = Number(normalised);
      if (normalised === null || normalised === undefined || normalised === '' || (def.type === 'number' && !Number.isFinite(normalised))) {
        throw new Error(`${def.label} is not a valid ${def.type === 'date' ? 'date' : def.type === 'amount' ? 'amount' : 'value'}.`);
      }
      merged[key] = { ...(merged[key] ?? {}), value: normalised, status: 'confirmed', candidates: [] };
      checkedFields[key] = normalised;
    }

    const confirmed = confirmedFieldValues(merged);
    const beforeDocument = await ApplianceDocument.findById(doc.id).lean();
    const beforeAppliance = applianceId ? await Appliance.findById(applianceId).lean() : null;
    const beforeDeadlines = await ApplianceDeadline.find({ sourceDocumentId: doc.id }).lean();
    const beforeReminders = applianceId ? await ApplianceReminder.find({ applianceId }).lean() : [];
    let appliance = applianceId ? await this.appliances.get(applianceId) : null;
    if (applianceId && !appliance) throw new Error(`No appliance with id ${applianceId}.`);
    if (!appliance) {
      appliance = await this.appliances.findOrCreate(confirmed, { sourceDocumentId: doc.id });
      if (!appliance) throw new Error('Confirm at least an appliance name, brand, model or serial number before saving.');
    } else {
      appliance = await this.appliances.update(appliance.id, { ...confirmed, confirmedFields: Object.keys(confirmed) }, { sourceDocumentId: doc.id });
    }

    try {
      const saved = await this.documents.confirm(doc.id, { applianceId: appliance.id, confirmedFields: merged, confirmedAt: new Date().toISOString() });
    const occurrences = [];
    for (const input of Array.isArray(deadlines) ? deadlines : []) {
      if (input.confirmed !== true) continue;
      const source = doc.extraction?.deadlines?.[Number(input.index)];
      if (!source) throw new Error(`Unknown deadline at index ${input.index}.`);
      const date = input.date !== undefined ? parseDate(input.date) : source.date;
      if (!date) throw new Error(`${source.title} needs a valid, documented date before it can be confirmed.`);
      const recurrence = input.recurrence === undefined ? source.recurrence : input.recurrence;
      const base = {
        applianceId: appliance.id,
        sourceDocumentId: doc.id,
        type: source.type,
        title: source.title,
        dueDate: date,
        amount: input.amount !== undefined ? (parseAmount(input.amount)?.value ?? null) : source.amount,
        currency: source.currency,
        recurrence,
        confirmed: true,
        status: 'active',
        notes: source.evidence || null,
      };
      if (recurrence && ['monthly', 'yearly'].includes(recurrence.frequency)) {
        const expanded = expandRecurrence(base, { monthsAhead: this.monthsAhead, today });
        for (const occurrence of expanded) occurrences.push(await this.deadlines.upsert(occurrence));
      } else {
        const key = `${appliance.id}:${base.type}:${doc.id}:${input.index}`;
        occurrences.push(await this.deadlines.upsert({ ...base, occurrenceKey: key }));
      }
    }
    await this.deadlines.cancelMissing(appliance.id, occurrences.map((x) => x.occurrenceKey), doc.id);
    const reminders = await this.reconcile(appliance.id, { today });
      return { appliance, document: saved, deadlines: occurrences, reminders };
    } catch (error) {
      // MongoDB standalone deployments do not support transactions. Restore every
      // touched collection so a failed confirmation cannot leave an orphan.
      await Promise.all([
        beforeDocument ? ApplianceDocument.replaceOne({ _id: beforeDocument._id }, beforeDocument, { upsert: true }) : ApplianceDocument.deleteOne({ _id: doc.id }),
        beforeAppliance ? Appliance.replaceOne({ _id: beforeAppliance._id }, beforeAppliance, { upsert: true }) : (appliance?.id ? Appliance.deleteOne({ _id: appliance.id }) : Promise.resolve()),
        ApplianceDeadline.deleteMany({ sourceDocumentId: doc.id }).then(() => beforeDeadlines.length ? ApplianceDeadline.insertMany(beforeDeadlines, { ordered: true }) : null),
        appliance?.id ? ApplianceReminder.deleteMany({ applianceId: appliance.id }).then(() => beforeReminders.length ? ApplianceReminder.insertMany(beforeReminders, { ordered: true }) : null) : null,
      ]);
      throw error;
    }
  }

  async updateAppliance(id, changes) {
    const appliance = await this.appliances.update(id, changes);
    if (!appliance) throw new Error(`No appliance with id ${id}.`);
    return appliance;
  }

  async deleteDocument(id) {
    const doc = await ApplianceDocument.findById(String(id)).lean();
    if (!doc) throw new Error(`No appliance document with id ${id}.`);
    const linked = doc.applianceId ? await Appliance.findById(doc.applianceId).lean() : null;
    const linkedDeadlines = await ApplianceDeadline.find({ sourceDocumentId: doc._id }).lean();
    const linkedReminders = await ApplianceReminder.find({ sourceDocumentId: doc._id }).lean();
    try {
      await Promise.all([
        ApplianceDeadline.deleteMany({ sourceDocumentId: doc._id }),
        ApplianceReminder.deleteMany({ sourceDocumentId: doc._id }),
      ]);
      await ApplianceDocument.deleteOne({ _id: doc._id });
      if (linked) {
        const remaining = await ApplianceDocument.countDocuments({ applianceId: linked._id });
        if (remaining === 0) await Appliance.deleteOne({ _id: linked._id });
        else await Appliance.updateOne({ _id: linked._id }, { $pull: { sourceDocumentIds: doc._id } });
      }
      return { id: doc._id, storedName: doc.storedName, applianceId: doc.applianceId };
    } catch (error) {
      // Compensating rollback keeps a standalone local MongoDB safe when a
      // multi-document transaction is unavailable.
      await Promise.all([
        ApplianceDocument.replaceOne({ _id: doc._id }, doc, { upsert: true }),
        linked ? Appliance.replaceOne({ _id: linked._id }, linked, { upsert: true }) : null,
        linkedDeadlines.length ? ApplianceDeadline.insertMany(linkedDeadlines, { ordered: true }) : null,
        linkedReminders.length ? ApplianceReminder.insertMany(linkedReminders, { ordered: true }) : null,
      ]);
      throw error;
    }
  }

  async updateDeadline(id, changes, { today = isoDate(new Date()) } = {}) {
    const deadline = await this.deadlines.update(id, changes);
    if (!deadline) throw new Error(`No deadline with id ${id}.`);
    await this.reconcile(deadline.applianceId, { today });
    return deadline;
  }

  async createReminder(deadlineId, windowDays) {
    const deadline = await this.deadlines.get(deadlineId);
    if (!deadline) throw new Error(`No deadline with id ${deadlineId}.`);
    return this.reminders.createForDeadline(deadline, windowDays);
  }
}
