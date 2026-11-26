import crypto from 'node:crypto';
import mongoose from 'mongoose';

let connectionPromise;

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required. Configure MONGODB_URI in backend/.env (local mongodb://127.0.0.1:27017/weave or Atlas); Weave will not fall back to local or in-memory storage.');
  profileCipher();
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, maxPoolSize: 5 }).catch((error) => { connectionPromise = null; throw new Error(`MongoDB connection failed: ${error.message}`); });
  }
  return connectionPromise;
}

export async function closeDatabase() { connectionPromise = null; if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); }
export function profileCipher() {
  const raw = String(process.env.WEAVE_PROFILE_ENCRYPTION_KEY ?? '').trim();
  if (!raw) throw new Error('WEAVE_PROFILE_ENCRYPTION_KEY is required; size profiles are never stored in plaintext.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) throw new Error('WEAVE_PROFILE_ENCRYPTION_KEY must be canonical base64 for exactly 32 bytes.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('WEAVE_PROFILE_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}
export function encryptProfile(value) { const key = profileCipher(); const plain = Buffer.from(JSON.stringify(value), 'utf8'); const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([cipher.update(plain), cipher.final()]); return { payload: Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'), encrypted: true }; }
export function decryptProfile(payload, encrypted) { const key = profileCipher(); if (!encrypted) throw new Error('Refusing to read a plaintext size profile; re-encrypt or remove the legacy record.'); const bytes = Buffer.from(String(payload ?? ''), 'base64'); if (bytes.length < 28) throw new Error('Stored size profile ciphertext is malformed.'); const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')); }
