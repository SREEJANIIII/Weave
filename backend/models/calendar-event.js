import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    start: { type: String, required: true },            // HH:MM
    end: { type: String, required: true },              // HH:MM
    location: { type: String, default: '' },
    attendees: { type: [String], default: [] },
    notes: { type: String, default: '' },
    occasion: { type: String, default: '' },
    source: { type: String, default: 'sample data' },
    provider: { type: String, default: 'sample' },
    connectionId: { type: String, default: 'sample_calendar', index: true },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false, collection: 'calendarevents' },
);

schema.index({ date: 1, start: 1 });
export const CalendarEvent = mongoose.models.CalendarEvent || mongoose.model('CalendarEvent', schema);

