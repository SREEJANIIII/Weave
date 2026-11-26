import mongoose from 'mongoose';

// Original bills / warranty cards live in a private local directory. Only their id,
// user-supplied filename and extraction metadata are stored here and sent to the UI.
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    applianceId: { type: String, default: null, index: true },
    kind: { type: String, enum: ['bill', 'warranty', 'service', 'amc', 'emi', 'return', 'other'], default: 'other' },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    storedName: { type: String, required: true }, // random name only; never a filesystem path
    status: { type: String, enum: ['pending_review', 'confirmed', 'rejected'], default: 'pending_review', index: true },
    extraction: { type: mongoose.Schema.Types.Mixed, default: () => ({ method: null, warnings: [], fields: {}, deadlines: [] }) },
    confirmedFields: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    confirmedAt: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true, versionKey: false, collection: 'appliance_documents' },
);

export const ApplianceDocument = mongoose.models.ApplianceDocument || mongoose.model('ApplianceDocument', schema);
