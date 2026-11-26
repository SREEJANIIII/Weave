import crypto from 'node:crypto';
import { ApplianceReminder } from '../models/appliance-reminder.js';
import { addDays, isoDate } from '../lib/dates.js';

const TERMINAL = new Set(['dismissed', 'completed', 'cancelled']);
const record = (x) =>
  x
    ? { ...x, id: x._id ?? x.id, kind: 'appliance_reminder', created_at: x.createdAt, updated_at: x.updatedAt }
    : null;

const remindAtFor = (dueDate, windowDays) => isoDate(addDays(new Date(`${dueDate}T00:00:00`), -Number(windowDays)));

export class ApplianceReminderRepository {
  async get(id) {
    return record(await ApplianceReminder.findById(String(id)).lean());
  }

  async list({ applianceId = null, status = null, limit = 100 } = {}) {
    const filter = {};
    if (applianceId) filter.applianceId = applianceId;
    if (status && status !== 'all') filter.status = status;
    return (await ApplianceReminder.find(filter).sort({ remindAt: 1, dueDate: 1 }).limit(Math.min(Math.max(Number(limit) || 100, 1), 200)).lean()).map(record);
  }

  async listUpcoming({ withinDays = 365, today = isoDate(new Date()), limit = 100 } = {}) {
    const end = isoDate(addDays(new Date(`${today}T00:00:00`), Math.max(Number(withinDays) || 365, 0)));
    return (
      await ApplianceReminder.find({ status: { $nin: ['dismissed', 'cancelled'] }, dueDate: { $gte: today, $lte: end } })
        .sort({ remindAt: 1, dueDate: 1 })
        .limit(Math.min(Math.max(Number(limit) || 100, 1), 200))
        .lean()
    ).map(record);
  }

  /** Create or refresh reminders from confirmed deadlines without losing a user's decision. */
  async reconcile(applianceId, deadlines, windows = [30, 14, 7]) {
    const wanted = new Map();
    for (const deadline of deadlines) {
      if (!deadline.confirmed || deadline.status !== 'active' || !deadline.dueDate) continue;
      for (const windowDays of windows) {
        const key = `${deadline.id}:${windowDays}`;
        wanted.set(key, {
          applianceId,
          deadlineId: deadline.id,
          sourceDocumentId: deadline.sourceDocumentId ?? null,
          type: deadline.type,
          title: deadline.title,
          dueDate: deadline.dueDate,
          windowDays,
          remindAt: remindAtFor(deadline.dueDate, windowDays),
          occurrenceKey: deadline.occurrenceKey,
        });
      }
    }
    for (const input of wanted.values()) {
      const existing = await ApplianceReminder.findOne({ deadlineId: input.deadlineId, windowDays: input.windowDays });
      if (existing) {
        // A confirmed date change moves the reminder; dismissed/completed states are kept.
        await ApplianceReminder.updateOne({ _id: existing._id }, { $set: input });
      } else {
        await ApplianceReminder.create({ _id: `rem_${crypto.randomUUID().slice(0, 8)}`, status: 'suggested', ...input });
      }
    }
    const activeDeadlineIds = new Set(deadlines.filter((d) => d.confirmed && d.status === 'active').map((d) => d.id));
    await ApplianceReminder.updateMany(
      { applianceId, deadlineId: { $nin: [...activeDeadlineIds] }, status: { $nin: ['dismissed', 'completed', 'cancelled'] } },
      { $set: { status: 'cancelled' } },
    );
    return this.list({ applianceId });
  }

  async createForDeadline(deadline, windowDays = 7) {
    const window = Number(windowDays);
    if (!Number.isInteger(window) || window < 0 || window > 365) throw new Error('Window must be a whole number of days between 0 and 365.');
    if (!deadline.confirmed) throw new Error('Reminders can only be created from a confirmed deadline.');
    const existing = await ApplianceReminder.findOne({ deadlineId: deadline.id, windowDays: window });
    if (existing) return record(existing.toObject());
    return record(
      (
        await ApplianceReminder.create({
          _id: `rem_${crypto.randomUUID().slice(0, 8)}`,
          applianceId: deadline.applianceId,
          deadlineId: deadline.id,
          sourceDocumentId: deadline.sourceDocumentId ?? null,
          type: deadline.type,
          title: deadline.title,
          dueDate: deadline.dueDate,
          windowDays: window,
          remindAt: remindAtFor(deadline.dueDate, window),
          occurrenceKey: deadline.occurrenceKey,
          status: 'suggested',
        })
      ).toObject(),
    );
  }

  async setStatus(id, status) {
    if (!['suggested', 'approved', 'dismissed', 'completed', 'cancelled'].includes(status)) throw new Error(`Unknown reminder status ${status}.`);
    return record(await ApplianceReminder.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' }).lean());
  }

  async updateWindow(id, windowDays) {
    const reminder = await ApplianceReminder.findById(id);
    if (!reminder) return null;
    reminder.windowDays = Number(windowDays);
    reminder.remindAt = remindAtFor(reminder.dueDate, reminder.windowDays);
    await reminder.save();
    return record(reminder.toObject());
  }
}

export { TERMINAL as TERMINAL_REMINDER_STATUSES };
