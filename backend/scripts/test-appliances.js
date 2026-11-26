// Appliance extraction, dedupe, recurring deadlines and reminder-state tests.
import assert from 'node:assert/strict';
import { normaliseExtraction, dedupeKey, parseDate } from '../lib/appliance-fields.js';
import { expandRecurrence } from '../repositories/appliance-deadline-repository.js';
import { verifyImageInput, VisionUnsupportedError, parseJsonObject } from '../lib/nvidia-vision.js';
import { connectDatabase, closeDatabase } from '../db/database.js';
import { Appliance } from '../models/appliance.js';
import { ApplianceDocument } from '../models/appliance-document.js';
import { ApplianceDeadline } from '../models/appliance-deadline.js';
import { ApplianceReminder } from '../models/appliance-reminder.js';
import { ApplianceRepository } from '../repositories/appliance-repository.js';
import { ApplianceDocumentRepository } from '../repositories/appliance-document-repository.js';
import { ApplianceDeadlineRepository } from '../repositories/appliance-deadline-repository.js';
import { ApplianceReminderRepository } from '../repositories/appliance-reminder-repository.js';
import { ApplianceService } from '../services/appliance-service.js';

process.env.NVIDIA_API_KEY ||= 'test-only-key';

// 1. Extraction never invents values, and separates missing / unclear / conflicting.
const extracted = normaliseExtraction({
  fields: {
    name: { value: 'LG Washing Machine', status: 'found', evidence: 'LG Washing Machine' },
    model: { value: null, status: 'missing', evidence: '' },
    price: { value: 'about thirty thousand', status: 'unclear', evidence: 'price looks like 30k' },
    serialNumber: { value: 'ABC1', status: 'conflicting', evidence: 'ABC1 / ABC2', candidates: ['ABC1', 'ABC2'] },
    purchaseDate: { value: '31/02/2025', status: 'found', evidence: '31/02/2025' },
  },
  deadlines: [{ type: 'warranty_expiry', title: 'Warranty', date: '2028-01-10', status: 'derived', evidence: 'Warranty: 3 years from 10/01/2025' }],
});
assert.equal(extracted.fields.name.status, 'found');
assert.equal(extracted.fields.model.status, 'missing');
assert.equal(extracted.fields.price.status, 'unclear');
assert.equal(extracted.fields.price.value, null);
assert.equal(extracted.fields.serialNumber.status, 'conflicting');
assert.equal(extracted.fields.serialNumber.candidates.length, 2);
assert.equal(extracted.fields.purchaseDate.status, 'unclear');
assert.equal(extracted.fields.purchaseDate.value, null, 'an impossible date is never kept');
assert.equal(extracted.deadlines.length, 1);
assert.equal(normaliseExtraction({ fields: { name: { value: 'X', status: 'found', evidence: '' } } }).fields.name.status, 'unclear', 'found without evidence must be reviewed');
assert.equal(dedupeKey({ serialNumber: ' abc-123 ' }), 'serial:abc123');
assert.equal(dedupeKey({ brand: 'LG', model: 'F10M5' }), 'appliance:lg|f10m5');
assert.equal(dedupeKey({}), null);
assert.equal(parseDate('2025-02-31'), null);
assert.deepEqual(parseJsonObject('```json\n{"a":1}\n```'), { a: 1 });
console.log('  ✓ extraction flags missing, unclear and conflicting data without inventing values');

// 2. Recurring EMI occurrences stay stable and skip past dates.
const emi = {
  applianceId: 'appl_test', type: 'emi_payment', title: 'EMI', dueDate: '2026-12-05', amount: 4200,
  recurrence: { frequency: 'monthly', dayOfMonth: 5 }, occurrenceKey: 'appl_test:emi_payment:2026-12',
};
const occurrences = expandRecurrence(emi, { monthsAhead: 3, today: '2026-11-27' });
assert.equal(occurrences.length, 3);
assert.equal(occurrences[0].dueDate, '2026-12-05');
assert.equal(occurrences[1].dueDate, '2027-01-05');
assert.equal(occurrences[2].dueDate, '2027-02-05');
assert.equal(expandRecurrence({ ...emi, recurrence: null }, { today: '2026-11-27' }).length, 0);

// 3. Image input is verified before use; a text-only model is rejected.
const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, text: async () => JSON.stringify(body) });
const probeCalls = [];
const visionFetch = async (url, options) => {
  if (String(url).includes('/models/')) return jsonResponse({ id: 'test/vl', object: 'model' });
  probeCalls.push(JSON.parse(options.body));
  return jsonResponse({ choices: [{ message: { content: 'OK' } }] });
};
const verified = await verifyImageInput({ model: 'test/vl', fetchImpl: visionFetch });
assert.equal(verified.supported, true);
assert.equal(verified.method, 'probe');
assert.equal(probeCalls.length, 1);
assert.ok(probeCalls[0].messages[0].content.some((part) => part.type === 'image_url'));
await assert.rejects(
  () => verifyImageInput({
    model: 'test/text-only',
    fetchImpl: async (url) => String(url).includes('/models/')
      ? jsonResponse({ id: 'test/text-only', input_modalities: ['text'] })
      : jsonResponse({ choices: [] }),
  }),
  VisionUnsupportedError,
);
console.log('  ✓ recurring EMI and image-input capability checks passed');

// 4. Persistence: confirm -> dedupe -> reminders keep dismissed state after a date change.
if (!process.env.MONGODB_URI) throw new Error('Appliance tests require MONGODB_URI.');
process.env.MONGODB_DB_NAME = `weave_appliances_test_${process.pid}`;
process.env.WEAVE_TODAY = '2026-11-27';
await connectDatabase();
await Promise.all([Appliance.deleteMany({}), ApplianceDocument.deleteMany({}), ApplianceDeadline.deleteMany({}), ApplianceReminder.deleteMany({})]);

const appliances = new ApplianceRepository();
const documents = new ApplianceDocumentRepository();
const deadlines = new ApplianceDeadlineRepository();
const reminders = new ApplianceReminderRepository();
const service = new ApplianceService({ appliances, documents, deadlines, reminders, windows: [7, 3], monthsAhead: 3 });
const source = await documents.create({
  kind: 'bill', originalName: 'lg-bill.png', mimeType: 'image/png', size: 100, storedName: 'test.png',
  extraction: {
    method: 'vision', warnings: [],
    fields: {
      name: { value: 'LG Washing Machine', status: 'found', evidence: 'LG Washing Machine' },
      brand: { value: 'LG', status: 'found', evidence: 'LG Washing Machine' },
      serialNumber: { value: 'ABC12345', status: 'found', evidence: 'Serial ABC12345' },
      price: { value: null, status: 'unclear', evidence: 'amount illegible' },
    },
    deadlines: [
      { type: 'warranty_expiry', title: 'Warranty expiry', date: '2027-03-12', amount: null, currency: null, recurrence: null, status: 'derived', evidence: '3 year warranty' },
      { type: 'emi_payment', title: 'EMI', date: '2026-12-05', amount: 4200, currency: 'INR', recurrence: { frequency: 'monthly', dayOfMonth: 5 }, status: 'found', evidence: 'EMI 4200 every 5th' },
    ],
  },
});
const result = await service.confirmDocument({
  documentId: source.id,
  fields: { name: 'LG Washing Machine', brand: 'LG', serialNumber: 'ABC12345', purchaseDate: '2024-03-12' },
  deadlines: [{ index: 0, confirmed: true, date: '2027-03-12' }, { index: 1, confirmed: true, date: '2026-12-05' }],
});
assert.equal(result.appliance.serialNumber, 'ABC12345');
assert.equal(result.appliance.price, null, 'an unclear price is not persisted as a fact');
assert.equal(result.document.status, 'confirmed');
assert.equal(result.deadlines.length, 4, 'one warranty plus three EMI occurrences');
assert.equal(result.reminders.length, 8, 'two windows for each confirmed deadline');
const dismissed = result.reminders.find((r) => r.type === 'warranty_expiry');
await reminders.setStatus(dismissed.id, 'dismissed');
const warranty = result.deadlines.find((d) => d.type === 'warranty_expiry');
await service.updateDeadline(warranty.id, { dueDate: '2027-05-01' });
const moved = await reminders.get(dismissed.id);
assert.equal(moved.dueDate, '2027-05-01');
assert.equal(moved.remindAt, '2027-04-24');
assert.equal(moved.status, 'dismissed', 'a dismissed reminder stays dismissed when the date changes');
const second = await documents.create({
  kind: 'warranty', originalName: 'warranty.pdf', mimeType: 'application/pdf', size: 50, storedName: 'test2.pdf',
  extraction: { method: 'pdf_text', warnings: [], fields: {}, deadlines: [] },
});
const secondResult = await service.confirmDocument({ documentId: second.id, fields: { serialNumber: 'ABC12345' } });
assert.equal(secondResult.appliance.id, result.appliance.id, 'a second document does not create a duplicate appliance');
assert.equal((await appliances.list()).length, 1);
assert.equal((await documents.list({ applianceId: result.appliance.id })).length, 2);
const unconfirmed = await deadlines.upsert({ applianceId: result.appliance.id, type: 'service', title: 'Service', dueDate: '2027-01-01', confirmed: false, occurrenceKey: 'appl_test:service:unconfirmed' });
await assert.rejects(() => service.createReminder(unconfirmed.id, 7), /confirmed deadline/);
const upcoming = await service.upcoming({ withinDays: 365 });
assert.ok(upcoming.deadlines.some((d) => d.dueDate === '2026-12-05' && d.confirmed));
await Promise.all([Appliance.deleteMany({}), ApplianceDocument.deleteMany({}), ApplianceDeadline.deleteMany({}), ApplianceReminder.deleteMany({})]);
await closeDatabase();
console.log('  ✓ appliance confirmation, deduplication, recurring EMI and reminder-state persistence passed');
