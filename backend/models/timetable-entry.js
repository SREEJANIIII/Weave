import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true, index: true },
  timetableDocumentId: { type: String, required: true, index: true },
  day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  subject: { type: String, required: true },
  classType: { type: String, default: '' },
  location: { type: String, default: '' },
  sourceDocumentId: { type: String, required: true },
}, { timestamps: true, versionKey: false, collection: 'timetable_entries' });
schema.index({ ownerId: 1, timetableDocumentId: 1, day: 1, startTime: 1, endTime: 1, subject: 1 }, { unique: true });
export const TimetableEntry = mongoose.models.TimetableEntry || mongoose.model('TimetableEntry', schema);
