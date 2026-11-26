import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    updated: { type: String, required: true, index: true }, // YYYY-MM-DD
    tags: { type: [String], default: [] },
    body: { type: String, default: '' },
    source: { type: String, default: 'sample data' },
    provider: { type: String, default: 'sample' },
    connectionId: { type: String, default: 'sample_notes', index: true },
  },
  { timestamps: true, versionKey: false, collection: 'notes' },
);

export const Note = mongoose.models.Note || mongoose.model('Note', schema);

