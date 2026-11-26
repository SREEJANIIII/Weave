// Private local storage for original appliance documents. Clients only ever see a
// document id: no directory, stored filename or filesystem path is exposed to the UI.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'appliances');
const dir = () => path.resolve(process.env.WEAVE_UPLOAD_DIR || DEFAULT_DIR);
const STORED_NAME = /^[0-9a-f-]{36}\.(pdf|png|jpg)$/;

export function isAllowedStoredName(name) {
  return Boolean(String(name ?? '').match(STORED_NAME));
}

export async function saveUpload(buffer, ext) {
  const storedName = `${randomUUID()}${ext}`;
  await fs.mkdir(dir(), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dir(), storedName), buffer, { mode: 0o600, flag: 'wx' });
  return storedName;
}

export async function readUpload(storedName) {
  if (!isAllowedStoredName(storedName)) throw new Error('Invalid document reference.');
  const file = path.join(dir(), storedName);
  if (path.dirname(file) !== dir()) throw new Error('Invalid document reference.');
  return fs.readFile(file);
}

export async function deleteUpload(storedName) {
  if (!isAllowedStoredName(storedName)) return;
  await fs.unlink(path.join(dir(), storedName)).catch(() => {});
}
