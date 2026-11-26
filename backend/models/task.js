import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    due: { type: String, default: null },
    list: { type: String, default: 'Inbox' },
    status: { type: String, enum: ['open', 'done'], default: 'open', index: true },
    notes: { type: String, default: '' },
    source: { type: String, default: '' },
    provider: { type: String, default: 'sample' },
    connectionId: { type: String, default: 'sample_tasks', index: true },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false, collection: 'tasks' },
);

export const Task = mongoose.models.Task || mongoose.model('Task', schema);

