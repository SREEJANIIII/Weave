import mongoose from 'mongoose';
const schema = new mongoose.Schema({ _id: { type: String, required: true }, productId: { type: String, sparse: true, unique: true }, productName: { type: String, required: true, trim: true }, description: { type: String, default: '' }, brand: { type: String, required: true, trim: true }, price: Number, productUrl: { type: String, required: true, unique: true }, imageUrl: String, category: { type: String, required: true }, occasion: { type: String, default: '' }, notes: { type: String, default: '' }, status: { type: String, enum: ['saved', 'purchased', 'archived'], default: 'saved' }, source: { type: String, default: 'user data' } }, { timestamps: true, versionKey: false, collection: 'wishlistitems' });
schema.index({ occasion: 1 });
schema.index({ brand: 1 });
schema.index({ category: 1 });
export const WishlistItem = mongoose.models.WishlistItem || mongoose.model('WishlistItem', schema);
