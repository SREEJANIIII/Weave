import crypto from 'node:crypto';
import mongoose from 'mongoose';

let connectionPromise;

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required. Configure MONGODB_URI in backend/.env (local mongodb://127.0.0.1:27017/weave or Atlas); Weave will not fall back to local or in-memory storage.');
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, maxPoolSize: 5 }).catch((error) => { connectionPromise = null; throw new Error(`MongoDB connection failed: ${error.message}`); });
  }
  return connectionPromise;
}

export async function closeDatabase() { connectionPromise = null; if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); }
export function profileCipher() { const raw = process.env.WEAVE_PROFILE_ENCRYPTION_KEY; if (!raw) return null; let key; try { key = Buffer.from(raw, 'base64'); } catch { throw new Error('WEAVE_PROFILE_ENCRYPTION_KEY must be base64-encoded 32 bytes.'); } if (key.length !== 32) throw new Error('WEAVE_PROFILE_ENCRYPTION_KEY must decode to exactly 32 bytes.'); return key; }
export function encryptProfile(value) { const key = profileCipher(); const plain = Buffer.from(JSON.stringify(value), 'utf8'); if (!key) return { payload: plain.toString('utf8'), encrypted: false }; const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([cipher.update(plain), cipher.final()]); return { payload: Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'), encrypted: true }; }
export function decryptProfile(payload, encrypted) { if (!encrypted) return JSON.parse(payload); const key = profileCipher(); if (!key) throw new Error('Encrypted size profile exists, but WEAVE_PROFILE_ENCRYPTION_KEY is not configured.'); const bytes = Buffer.from(payload, 'base64'); const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')); }
