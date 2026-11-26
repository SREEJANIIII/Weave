import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    date: { type: String, required: true, index: true },
    merchant: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, default: 'Other' },
    source: { type: String, default: 'sample data' },
    provider: { type: String, default: 'sample' },
    connectionId: { type: String, default: 'sample_money', index: true },
  },
  { timestamps: true, versionKey: false, collection: 'transactions' },
);

export const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', schema);

