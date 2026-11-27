import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true, index: true },
  originalName: { type: String, required: true },
  sha256: { type: String, required: true },
  mimeType: { type: String, required: true },
  status: { type: String, enum: ['pending_review', 'confirmed', 'rejected'], default: 'pending_review', index: true },
  rawText: { type: String, default: '' },
  extractedEntries: { type: Array, default: [] },
}, { timestamps: true, versionKey: false, collection: 'timetable_documents' });
schema.index({ ownerId: 1, sha256: 1 }, { unique: true });
export const TimetableDocument = mongoose.models.TimetableDocument || mongoose.model('TimetableDocument', schema);
