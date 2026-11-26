import mongoose from 'mongoose';
const schema = new mongoose.Schema({ _id: { type: String, required: true }, wishlistItemId: { type: String, required: true, index: true }, calendarEventId: { type: String, default: null }, occasion: { type: String, required: true }, eventDate: { type: String, required: true, index: true }, reminderWindow: { type: Number, enum: [30, 14, 7], required: true }, status: { type: String, enum: ['suggested', 'pending_approval', 'approved', 'dismissed', 'completed', 'cancelled'], default: 'suggested', index: true } }, { timestamps: true, versionKey: false, collection: 'reminders' });
schema.index({ wishlistItemId: 1, calendarEventId: 1, reminderWindow: 1 }, { unique: true });
export const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', schema);
