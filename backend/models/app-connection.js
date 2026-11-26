import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g. 'conn_calendar_google_abc123' or 'sample_calendar'
    app: { type: String, enum: ['calendar', 'notes', 'tasks', 'money'], required: true, index: true },
    provider: { type: String, required: true, default: 'sample' }, // google_calendar, apple_calendar, samsung_calendar, outlook_calendar, obsidian, google_keep, etc.
    sourceType: {
      type: String,
      enum: [
        'sample',
        'ics_file',
        'ics_url',
        'caldav',
        'google_oauth',
        'markdown_folder',
        'markdown_upload',
        'google_keep',
        'csv_upload',
        'csv_file',
        'ics_vtodo',
        'todoist_csv',
        'manual',
      ],
      default: 'sample',
    },
    sourceName: { type: String, default: 'sample data' },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    itemCount: { type: Number, default: 0 },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false, collection: 'appconnections' },
);

export const AppConnection = mongoose.models.AppConnection || mongoose.model('AppConnection', schema);
