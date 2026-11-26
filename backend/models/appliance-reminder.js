import mongoose from 'mongoose';

// Reminders are derived from confirmed deadlines. Dismissed/completed states survive
// reconciliation; changing a confirmed date updates the dates but keeps that state.
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    applianceId: { type: String, required: true, index: true },
    deadlineId: { type: String, required: true, index: true },
    sourceDocumentId: { type: String, default: null },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    dueDate: { type: String, required: true, index: true },
    windowDays: { type: Number, required: true },
    remindAt: { type: String, required: true, index: true },
    occurrenceKey: { type: String, required: true, index: true },
    status: { type: String, enum: ['suggested', 'approved', 'dismissed', 'completed', 'cancelled'], default: 'suggested', index: true },
  },
  { timestamps: true, versionKey: false, collection: 'appliance_reminders' },
);
schema.index({ deadlineId: 1, windowDays: 1 }, { unique: true });

export const ApplianceReminder = mongoose.models.ApplianceReminder || mongoose.model('ApplianceReminder', schema);
