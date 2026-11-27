import mongoose from 'mongoose';

// A paper the person saved: a receipt, warranty, bill, timetable or note, with everything read from it.
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    kind: { type: String, default: 'other' },
    title: { type: String, required: true, trim: true },
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    image: { type: String, default: null }, // small preview (data URL) or a "sample:" token
    original: { type: { data: String, mediaType: String }, default: null, select: false }, // full photo/PDF, base64
    fileName: { type: String, default: '' },
    source: { type: String, default: 'typed' },
    sample: { type: Boolean, default: false },
    savedAt: { type: String, required: true },
    content: {
      type: {
        text: { type: String, default: '' }, // every word read from the document, in reading order
        tables: { type: [mongoose.Schema.Types.Mixed], default: [] }, // [{ title, columns: [], rows: [[]] }]
        method: { type: String, default: '' },
        readAt: { type: String, default: '' },
      },
      default: null,
    },
  },
  { timestamps: true, versionKey: false, collection: 'savedpapers' },
);
schema.index({ savedAt: -1 });

export const SavedPaper = mongoose.models.SavedPaper || mongoose.model('SavedPaper', schema);
