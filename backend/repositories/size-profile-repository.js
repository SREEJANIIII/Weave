import { decryptProfile, encryptProfile } from '../db/database.js';
import { SizeProfile } from '../models/size-profile.js';
export class SizeProfileRepository {
  async seed(profile) { if (await SizeProfile.exists({})) return; const stored = encryptProfile(profile); await SizeProfile.create({ _id: profile.id, profilePayload: stored.payload, measurementsEncrypted: stored.encrypted, deleted: false, unit: profile.unit, preferredFit: profile.preferred_fit, preferredCategories: profile.preferred_categories }); }
  async get() { const row = await SizeProfile.findOne({ deleted: false }).lean(); if (!row || !row.profilePayload) return null; const profile = decryptProfile(row.profilePayload, row.measurementsEncrypted); return { ...profile, kind: 'size_profile', encrypted: Boolean(row.measurementsEncrypted) }; }
  async update(changes) {
    const current = await this.get();
    const base = current ?? { id: 'profile_primary', kind: 'size_profile', unit: 'cm', measurements: {}, preferred_fit: 'regular', preferred_categories: [], source: 'user size profile' };
    const next = { ...base, measurements: { ...(base.measurements ?? {}) } };
    for (const key of ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height']) {
      if (changes[key] === null) delete next.measurements[key];
      else if (changes[key] !== undefined) next.measurements[key] = changes[key];
    }
    for (const key of ['unit', 'preferred_fit', 'preferred_categories']) if (changes[key] !== undefined) next[key] = changes[key];
    const stored = encryptProfile(next);
    await SizeProfile.findByIdAndUpdate(next.id, { $set: { profilePayload: stored.payload, measurementsEncrypted: stored.encrypted, deleted: false, unit: next.unit, preferredFit: next.preferred_fit, preferredCategories: next.preferred_categories } }, { upsert: true });
    return { ...next, encrypted: stored.encrypted };
  }
  async delete() { await SizeProfile.updateMany({}, { $set: { deleted: true, profilePayload: null } }); return true; }
}
