import mongoose from 'mongoose';

export const DEADLINE_TYPES = ['warranty_expiry', 'service', 'amc_renewal', 'emi_payment', 'return_window', 'other'];

// One deadline occurrence. Recurring EMI schedules are expanded into one record per
// occurrence; occurrenceKey keeps them stable when a confirmed date changes.
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    applianceId: { type: String, required: true, index: true },
    sourceDocumentId: { type: String, default: null },
    type: { type: String, enum: DEADLINE_TYPES, required: true, index: true },
    title: { type: String, required: true },
    dueDate: { type: String, required: true, index: true },
    amount: { type: Number, default: null },
    currency: { type: String, default: null },
    recurrence: { type: mongoose.Schema.Types.Mixed, default: null },
    occurrenceKey: { type: String, required: true, unique: true },
    confirmed: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
    notes: { type: String, default: null },
  },
  { timestamps: true, versionKey: false, collection: 'appliance_deadlines' },
);

export const ApplianceDeadline = mongoose.models.ApplianceDeadline || mongoose.model('ApplianceDeadline', schema);
