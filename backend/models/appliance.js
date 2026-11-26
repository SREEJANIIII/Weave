import mongoose from 'mongoose';

// One physical appliance. The dedupeKey is derived from documented identity fields so
// confirming a second invoice for the same device updates it instead of creating a twin.
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    dedupeKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: null },
    brand: { type: String, default: null },
    model: { type: String, default: null },
    serialNumber: { type: String, default: null },
    purchaseDate: { type: String, default: null },
    price: { type: Number, default: null },
    currency: { type: String, default: null },
    warrantyMonths: { type: Number, default: null },
    serviceDetails: { type: String, default: null },
    amcProvider: { type: String, default: null },
    notes: { type: String, default: null },
    confirmedFields: { type: [String], default: [] },
    sourceDocumentIds: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  },
  { timestamps: true, versionKey: false, collection: 'appliances' },
);

export const Appliance = mongoose.models.Appliance || mongoose.model('Appliance', schema);
