import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { CalendarEvent } from '../models/calendar-event.js';
import { Note } from '../models/note.js';
import { Task } from '../models/task.js';
import { Transaction } from '../models/transaction.js';
import { AppConnection } from '../models/app-connection.js';
import { calendarEvents, notes as sampleNotes, tasks as sampleTasks, transactions as sampleTransactions } from '../mcp-servers/lib/sample-data.js';
import { parseStatementCsv } from '../lib/connectors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultCsvPath = process.env.WEAVE_STATEMENT_CSV || path.join(here, '..', 'data', 'statement.csv');

const MODELS = {
  calendar: { Model: CalendarEvent, sampleId: 'sample_calendar' },
  notes: { Model: Note, sampleId: 'sample_notes' },
  tasks: { Model: Task, sampleId: 'sample_tasks' },
  money: { Model: Transaction, sampleId: 'sample_money' },
};

const toEvent = (doc) => {
  const x = doc.toObject ? doc.toObject() : doc;
  return {
    id: x._id ?? x.id,
    kind: 'event',
    title: x.title,
    date: x.date,
    start: x.start,
    end: x.end,
    location: x.location ?? '',
    attendees: x.attendees ?? [],
    notes: x.notes ?? '',
    provider: x.provider ?? 'sample',
    connectionId: x.connectionId ?? 'sample_calendar',
    source: x.source ?? 'sample data',
    ...(x.occasion ? { occasion: x.occasion } : {}),
    ...(x.createdBy ? { created_by: x.createdBy } : {}),
  };
};

const toNote = (doc) => {
  const x = doc.toObject ? doc.toObject() : doc;
  return {
    id: x._id ?? x.id,
    kind: 'note',
    title: x.title,
    updated: x.updated,
    tags: x.tags ?? [],
    body: x.body ?? '',
    provider: x.provider ?? 'sample',
    connectionId: x.connectionId ?? 'sample_notes',
    source: x.source ?? 'sample data',
  };
};

const toTask = (doc) => {
  const x = doc.toObject ? doc.toObject() : doc;
  return {
    id: x._id ?? x.id,
    kind: 'task',
    title: x.title,
    due: x.due ?? null,
    list: x.list ?? 'Inbox',
    status: x.status ?? 'open',
    notes: x.notes ?? '',
    provider: x.provider ?? 'sample',
    connectionId: x.connectionId ?? 'sample_tasks',
    ...(x.source ? { source: x.source } : {}),
    ...(x.createdBy ? { created_by: x.createdBy } : {}),
  };
};

const toTxn = (doc) => {
  const x = doc.toObject ? doc.toObject() : doc;
  return {
    id: x._id ?? x.id,
    kind: 'transaction',
    date: x.date,
    merchant: x.merchant,
    amount: x.amount,
    category: x.category ?? 'Other',
    provider: x.provider ?? 'sample',
    connectionId: x.connectionId ?? 'sample_money',
    source: x.source ?? 'sample data',
  };
};

const toConn = (doc) => ({
  id: doc._id,
  app: doc.app,
  provider: doc.provider,
  sourceType: doc.sourceType,
  sourceName: doc.sourceName,
  config: doc.config ?? {},
  itemCount: doc.itemCount ?? 0,
  lastSyncedAt: doc.lastSyncedAt,
});

export class AppDataRepository {
  async ensureCalendarSeeded() {
    const count = await AppConnection.countDocuments({ app: 'calendar' });
    if (count === 0 && (await CalendarEvent.countDocuments()) === 0) {
      await this.resetCalendarSample();
    }
  }

  async ensureNotesSeeded() {
    const count = await AppConnection.countDocuments({ app: 'notes' });
    if (count === 0 && (await Note.countDocuments()) === 0) {
      await this.resetNotesSample();
    }
  }

  async ensureTasksSeeded() {
    const count = await AppConnection.countDocuments({ app: 'tasks' });
    if (count === 0 && (await Task.countDocuments()) === 0) {
      await this.resetTasksSample();
    }
  }

  async ensureMoneySeeded() {
    const count = await AppConnection.countDocuments({ app: 'money' });
    if (count === 0 && (await Transaction.countDocuments()) === 0) {
      await this.resetMoneySample();
    }
  }

  async resetCalendarSample() {
    const data = calendarEvents();
    await CalendarEvent.deleteMany({});
    await AppConnection.deleteMany({ app: 'calendar' });
    if (data.length) {
      await CalendarEvent.insertMany(
        data.map((e) => ({
          _id: e.id,
          title: e.title,
          date: e.date,
          start: e.start,
          end: e.end,
          location: e.location ?? '',
          attendees: e.attendees ?? [],
          notes: e.notes ?? '',
          occasion: e.occasion ?? '',
          source: 'sample data',
          provider: 'sample',
          connectionId: 'sample_calendar',
        })),
      );
    }
    await AppConnection.create({
      _id: 'sample_calendar',
      app: 'calendar',
      provider: 'sample',
      sourceType: 'sample',
      sourceName: 'sample data',
      itemCount: data.length,
    });
  }

  async resetNotesSample() {
    const data = sampleNotes();
    await Note.deleteMany({});
    await AppConnection.deleteMany({ app: 'notes' });
    if (data.length) {
      await Note.insertMany(
        data.map((n) => ({
          _id: n.id,
          title: n.title,
          updated: n.updated,
          tags: n.tags ?? [],
          body: n.body ?? '',
          source: 'sample data',
          provider: 'sample',
          connectionId: 'sample_notes',
        })),
      );
    }
    await AppConnection.create({
      _id: 'sample_notes',
      app: 'notes',
      provider: 'sample',
      sourceType: 'sample',
      sourceName: 'sample data',
      itemCount: data.length,
    });
  }

  async resetTasksSample() {
    const data = sampleTasks();
    await Task.deleteMany({});
    await AppConnection.deleteMany({ app: 'tasks' });
    if (data.length) {
      await Task.insertMany(
        data.map((t) => ({
          _id: t.id,
          title: t.title,
          due: t.due ?? null,
          list: t.list ?? 'Inbox',
          status: t.status ?? 'open',
          notes: t.notes ?? '',
          source: t.source ?? 'sample data',
          provider: 'sample',
          connectionId: 'sample_tasks',
        })),
      );
    }
    await AppConnection.create({
      _id: 'sample_tasks',
      app: 'tasks',
      provider: 'sample',
      sourceType: 'sample',
      sourceName: 'sample data',
      itemCount: data.length,
    });
  }

  async resetMoneySample() {
    const hasFile = fs.existsSync(defaultCsvPath);
    const data = hasFile ? parseStatementCsv(fs.readFileSync(defaultCsvPath, 'utf8')) : sampleTransactions();
    const sourceType = hasFile ? 'csv_file' : 'sample';
    const sourceName = hasFile ? path.basename(defaultCsvPath) : 'generated sample statement';
    await Transaction.deleteMany({});
    await AppConnection.deleteMany({ app: 'money' });
    if (data.length) {
      await Transaction.insertMany(
        data.map((t) => ({
          _id: t.id,
          date: t.date,
          merchant: t.merchant,
          amount: t.amount,
          category: t.category ?? 'Other',
          source: sourceName,
          provider: hasFile ? 'csv_file' : 'sample',
          connectionId: 'sample_money',
        })),
      );
    }
    await AppConnection.create({
      _id: 'sample_money',
      app: 'money',
      provider: hasFile ? 'csv_file' : 'sample',
      sourceType,
      sourceName,
      itemCount: data.length,
    });
  }

  async resetAllDemo() {
    await Promise.all([
      this.resetCalendarSample(),
      this.resetNotesSample(),
      this.resetTasksSample(),
      this.resetMoneySample(),
    ]);
  }

  async listConnections() {
    await Promise.all([
      this.ensureCalendarSeeded(),
      this.ensureNotesSeeded(),
      this.ensureTasksSeeded(),
      this.ensureMoneySeeded(),
    ]);
    return (await AppConnection.find({}).sort({ createdAt: 1 }).lean()).map(toConn);
  }

  /** Summarizes connections by app for /api/status cleanly. */
  async getConnectionsSummary() {
    const all = await this.listConnections();
    const byApp = {};
    for (const app of ['calendar', 'notes', 'tasks', 'money']) {
      const list = all.filter((c) => c.app === app);
      const real = list.filter((c) => c.sourceType !== 'sample');
      if (real.length > 0) {
        byApp[app] = {
          sourceType: real.length === 1 ? real[0].sourceType : 'connected',
          sourceName: real.map((r) => r.sourceName).join(' + '),
          providers: real.map((r) => r.provider),
          connections: list,
        };
      } else {
        const s = list[0] ?? { sourceType: 'sample', sourceName: 'sample data' };
        byApp[app] = {
          sourceType: s.sourceType,
          sourceName: s.sourceName,
          providers: ['sample'],
          connections: list,
        };
      }
    }
    return byApp;
  }

  async getConnection(id) {
    const doc = await AppConnection.findById(id).lean();
    return doc ? toConn(doc) : null;
  }

  async #clearSampleForApp(app) {
    const { Model, sampleId } = MODELS[app];
    await Model.deleteMany({ connectionId: sampleId });
    await AppConnection.deleteOne({ _id: sampleId });
  }

  async #upsertConnection({ connectionId, app, provider, sourceType, sourceName, config = {}, itemCount = 0 }) {
    const id = connectionId || `conn_${app}_${provider}_${crypto.randomUUID().slice(0, 6)}`;
    const doc = await AppConnection.findByIdAndUpdate(
      id,
      { $set: { app, provider, sourceType, sourceName, config, itemCount, lastSyncedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
    return toConn(doc);
  }

  async removeConnection(connectionId) {
    const conn = await AppConnection.findById(connectionId).lean();
    if (!conn) return null;
    const { Model } = MODELS[conn.app];
    await Model.deleteMany({ connectionId });
    await AppConnection.deleteOne({ _id: connectionId });
    // If no connections remain for this app, keep empty or let user see 0 items (until Restore sample)
    return toConn(conn);
  }

  // --- Calendar ---
  async listEvents({ date, start_date, end_date } = {}) {
    await this.ensureCalendarSeeded();
    const query = {};
    const from = date ?? start_date;
    const to = date ?? end_date ?? start_date;
    if (from && to) query.date = { $gte: from, $lte: to };
    else if (from) query.date = from;
    return (await CalendarEvent.find(query).sort({ date: 1, start: 1 }).lean()).map(toEvent);
  }

  async getEvent(id) {
    await this.ensureCalendarSeeded();
    const row = await CalendarEvent.findById(id).lean();
    return row ? toEvent(row) : null;
  }

  async createEvent({ title, date, start, end, location = '', notes = '', occasion = '', source = 'user data', provider = 'manual', createdBy = 'Weave' }) {
    await this.ensureCalendarSeeded();
    const conn = await this.#upsertConnection({
      connectionId: `manual_calendar_${provider}`,
      app: 'calendar',
      provider,
      sourceType: 'manual',
      sourceName: 'Added events',
    });
    const id = `evt_new_${crypto.randomUUID().slice(0, 6)}`;
    const doc = await CalendarEvent.create({
      _id: id,
      title,
      date,
      start,
      end,
      location,
      attendees: [],
      notes,
      occasion,
      source,
      provider,
      connectionId: conn.id,
      createdBy,
    });
    const count = await CalendarEvent.countDocuments({ connectionId: conn.id });
    await AppConnection.findByIdAndUpdate(conn.id, { $set: { itemCount: count } });
    return toEvent(doc);
  }

  async importEvents(events, { connectionId, provider = 'custom_ics', sourceType, sourceName, config = {}, replaceAll = false }) {
    await this.#clearSampleForApp('calendar');
    if (replaceAll) {
      await CalendarEvent.deleteMany({});
      await AppConnection.deleteMany({ app: 'calendar' });
    }
    const cid = connectionId || `conn_calendar_${provider}_${crypto.randomUUID().slice(0, 6)}`;
    if (connectionId) {
      await CalendarEvent.deleteMany({ connectionId: cid });
    }
    const docs = events.map((e) => ({
      _id: e.id ? `${cid}_${e.id}`.slice(0, 64) : `${cid}_${crypto.randomUUID().slice(0, 8)}`,
      title: e.title,
      date: e.date,
      start: e.start,
      end: e.end,
      location: e.location ?? '',
      attendees: e.attendees ?? [],
      notes: e.notes ?? '',
      occasion: e.occasion ?? '',
      source: sourceName,
      provider,
      connectionId: cid,
    }));
    for (const d of docs) {
      await CalendarEvent.findByIdAndUpdate(d._id, { $set: d }, { upsert: true });
    }
    const connection = await this.#upsertConnection({
      connectionId: cid,
      app: 'calendar',
      provider,
      sourceType,
      sourceName,
      config,
      itemCount: docs.length,
    });
    return { imported: docs.length, connection };
  }

  async deleteEvent(id) {
    const del = await CalendarEvent.findByIdAndDelete(id).lean();
    if (del?.connectionId) {
      const count = await CalendarEvent.countDocuments({ connectionId: del.connectionId });
      await AppConnection.findByIdAndUpdate(del.connectionId, { $set: { itemCount: count } });
    }
    return del;
  }

  // --- Notes ---
  async listNotes() {
    await this.ensureNotesSeeded();
    return (await Note.find({}).sort({ updated: -1, _id: 1 }).lean()).map(toNote);
  }

  async getNote(id) {
    await this.ensureNotesSeeded();
    const row = await Note.findById(id).lean();
    return row ? toNote(row) : null;
  }

  async createNote({ title, body, tags = ['personal'], updated, provider = 'manual', source = 'user note' }) {
    await this.ensureNotesSeeded();
    const conn = await this.#upsertConnection({
      connectionId: 'manual_notes',
      app: 'notes',
      provider,
      sourceType: 'manual',
      sourceName: 'Your notes',
    });
    const id = `note_${crypto.randomUUID().slice(0, 8)}`;
    const doc = await Note.create({
      _id: id,
      title,
      body: body ?? '',
      tags: Array.isArray(tags) ? tags : [],
      updated: updated || new Date().toISOString().slice(0, 10),
      source,
      provider,
      connectionId: conn.id,
    });
    const count = await Note.countDocuments({ connectionId: conn.id });
    await AppConnection.findByIdAndUpdate(conn.id, { $set: { itemCount: count } });
    return toNote(doc);
  }

  async importNotes(notesList, { connectionId, provider = 'markdown', sourceType, sourceName, config = {}, replaceAll = false }) {
    await this.#clearSampleForApp('notes');
    if (replaceAll) {
      await Note.deleteMany({});
      await AppConnection.deleteMany({ app: 'notes' });
    }
    const cid = connectionId || `conn_notes_${provider}_${crypto.randomUUID().slice(0, 6)}`;
    if (connectionId) await Note.deleteMany({ connectionId: cid });
    const docs = notesList.map((n) => ({
      _id: n.id ? `${cid}_${n.id}`.slice(0, 64) : `${cid}_${crypto.randomUUID().slice(0, 8)}`,
      title: n.title,
      updated: n.updated,
      tags: n.tags ?? [],
      body: n.body ?? '',
      source: sourceName,
      provider,
      connectionId: cid,
    }));
    for (const d of docs) await Note.findByIdAndUpdate(d._id, { $set: d }, { upsert: true });
    const connection = await this.#upsertConnection({
      connectionId: cid,
      app: 'notes',
      provider,
      sourceType,
      sourceName,
      config,
      itemCount: docs.length,
    });
    return { imported: docs.length, connection };
  }

  async deleteNote(id) {
    return Note.findByIdAndDelete(id).lean();
  }

  // --- Tasks ---
  async listTasks() {
    await this.ensureTasksSeeded();
    return (await Task.find({}).lean()).map(toTask);
  }

  async getTask(id) {
    await this.ensureTasksSeeded();
    const row = await Task.findById(id).lean();
    return row ? toTask(row) : null;
  }

  async createTask({ title, due = null, list = 'Inbox', notes = '', status = 'open', provider = 'manual', source = 'user task', createdBy = 'Weave' }) {
    await this.ensureTasksSeeded();
    const conn = await this.#upsertConnection({
      connectionId: `manual_tasks_${provider}`,
      app: 'tasks',
      provider,
      sourceType: 'manual',
      sourceName: provider === 'manual' ? 'Your tasks' : source,
    });
    const id = `t_${crypto.randomUUID().slice(0, 6)}`;
    const doc = await Task.create({ _id: id, title, due, list, status, notes, source, provider, connectionId: conn.id, createdBy });
    const count = await Task.countDocuments({ connectionId: conn.id });
    await AppConnection.findByIdAndUpdate(conn.id, { $set: { itemCount: count } });
    return toTask(doc);
  }

  async importTasks(tasksList, { connectionId, provider = 'checklist', sourceType = 'manual', sourceName = 'Imported tasks', config = {}, replaceAll = false }) {
    await this.#clearSampleForApp('tasks');
    if (replaceAll) {
      await Task.deleteMany({});
      await AppConnection.deleteMany({ app: 'tasks' });
    }
    const cid = connectionId || `conn_tasks_${provider}_${crypto.randomUUID().slice(0, 6)}`;
    if (connectionId) await Task.deleteMany({ connectionId: cid });
    const docs = tasksList.map((t) => ({
      _id: `${cid}_${crypto.randomUUID().slice(0, 8)}`,
      title: t.title,
      due: t.due ?? null,
      list: t.list ?? 'Personal',
      status: t.status === 'done' ? 'done' : 'open',
      notes: t.notes ?? '',
      source: sourceName,
      provider,
      connectionId: cid,
      createdBy: `Imported from ${sourceName}`,
    }));
    if (docs.length) await Task.insertMany(docs);
    const connection = await this.#upsertConnection({
      connectionId: cid,
      app: 'tasks',
      provider,
      sourceType,
      sourceName,
      config,
      itemCount: docs.length,
    });
    return { imported: docs.length, connection };
  }

  async updateTask(id, changes) {
    const allowed = {};
    for (const k of ['title', 'due', 'list', 'status', 'notes']) {
      if (changes[k] !== undefined) allowed[k] = changes[k];
    }
    const row = await Task.findByIdAndUpdate(id, { $set: allowed }, { new: true }).lean();
    return row ? toTask(row) : null;
  }

  async deleteTask(id) {
    return Task.findByIdAndDelete(id).lean();
  }

  // --- Money ---
  async listTransactions() {
    await this.ensureMoneySeeded();
    return (await Transaction.find({}).sort({ date: -1, _id: 1 }).lean()).map(toTxn);
  }

  async getMoneySource() {
    await this.ensureMoneySeeded();
    const real = await AppConnection.find({ app: 'money', sourceType: { $ne: 'sample' } }).lean();
    if (!real.length) {
      return { type: 'sample data', name: 'generated sample statement' };
    }
    return { type: 'imported file', name: real.map((r) => r.sourceName).join(' + ') };
  }

  async createTransaction({ date, merchant, amount, category = 'Other' }) {
    await this.ensureMoneySeeded();
    const conn = await this.#upsertConnection({
      connectionId: 'manual_money',
      app: 'money',
      provider: 'manual',
      sourceType: 'manual',
      sourceName: 'Manual expenses',
    });
    const id = `txn_${crypto.randomUUID().slice(0, 6)}`;
    const doc = await Transaction.create({ _id: id, date, merchant, amount: Number(amount), category, source: 'manual entry', provider: 'manual', connectionId: conn.id });
    const count = await Transaction.countDocuments({ connectionId: conn.id });
    await AppConnection.findByIdAndUpdate(conn.id, { $set: { itemCount: count } });
    return toTxn(doc);
  }

  async importTransactions(txns, { connectionId, provider = 'csv_upload', sourceType = 'csv_upload', sourceName = 'statement.csv', replaceAll = false }) {
    await this.#clearSampleForApp('money');
    if (replaceAll) {
      await Transaction.deleteMany({});
      await AppConnection.deleteMany({ app: 'money' });
    }
    const cid = connectionId || `conn_money_${provider}_${crypto.randomUUID().slice(0, 6)}`;
    if (connectionId) await Transaction.deleteMany({ connectionId: cid });
    const docs = txns.map((t, idx) => ({
      _id: `${cid}_${t.id || 'txn'}_${idx + 1}`,
      date: t.date,
      merchant: t.merchant,
      amount: t.amount,
      category: t.category ?? 'Other',
      source: sourceName,
      provider,
      connectionId: cid,
    }));
    if (docs.length) await Transaction.insertMany(docs);
    const connection = await this.#upsertConnection({
      connectionId: cid,
      app: 'money',
      provider,
      sourceType,
      sourceName,
      itemCount: docs.length,
    });
    return { imported: docs.length, connection };
  }

  async deleteTransaction(id) {
    return Transaction.findByIdAndDelete(id).lean();
  }
}
