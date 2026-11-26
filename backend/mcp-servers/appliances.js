#!/usr/bin/env node
// Sixth MCP server: appliances, their documents, confirmed deadlines and reminders.
// All records carry `kind` so the shared planner can cite them like any other app.
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, WRITE } from './lib/kit.js';
import { connectDatabase, closeDatabase } from '../db/database.js';
import { ApplianceRepository } from '../repositories/appliance-repository.js';
import { ApplianceDocumentRepository } from '../repositories/appliance-document-repository.js';
import { ApplianceDeadlineRepository } from '../repositories/appliance-deadline-repository.js';
import { ApplianceReminderRepository } from '../repositories/appliance-reminder-repository.js';
import { ApplianceService } from '../services/appliance-service.js';
import { DEADLINE_TYPES, parseWindows, parseDate } from '../lib/appliance-fields.js';
import { deleteUpload } from '../lib/appliance-uploads.js';

await connectDatabase();
const service = new ApplianceService({
  appliances: new ApplianceRepository(),
  documents: new ApplianceDocumentRepository(),
  deadlines: new ApplianceDeadlineRepository(),
  reminders: new ApplianceReminderRepository(),
  windows: parseWindows(process.env.APPLIANCE_REMINDER_WINDOWS),
  monthsAhead: Number(process.env.APPLIANCE_EMI_MONTHS_AHEAD) || 6,
});
const server = createServer('weave-appliances');
const date = () => process.env.WEAVE_TODAY || new Date().toISOString().slice(0, 10);
const safe = async (fn) => {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error?.message ?? 'Appliance request failed.');
  }
};
const fields = {
  name: z.string().min(2).optional(), brand: z.string().min(1).optional(), model: z.string().min(1).optional(),
  serialNumber: z.string().min(1).optional(), purchaseDate: z.string().optional(), price: z.number().nonnegative().optional(),
  warrantyMonths: z.number().int().nonnegative().optional(), serviceDetails: z.string().optional(), amcProvider: z.string().optional(), notes: z.string().optional(),
};

server.registerTool('search_appliances', { title: 'Search appliances', description: 'Search appliances by name, brand, model or serial number.', inputSchema: { query: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }, annotations: READ }, async ({ query, limit }) => safe(async () => ({ appliances: await service.appliances.list({ query, limit }) })));
server.registerTool('get_appliance', { title: 'Get appliance details', description: 'Retrieve one appliance with its linked documents, deadlines and reminders by id.', inputSchema: { id: z.string().min(1) }, annotations: READ }, async ({ id }) => safe(async () => {
  const details = await service.details(id);
  if (!details) throw new Error(`No appliance with id ${id}.`);
  return details;
}));
server.registerTool('get_appliance_documents', { title: 'Get appliance documents', description: 'List linked appliance documents, or retrieve one document by id.', inputSchema: { applianceId: z.string().optional(), id: z.string().optional(), status: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }, annotations: READ }, async ({ applianceId, id, status, limit }) => safe(async () => {
  if (id) {
    const document = await service.documents.get(id);
    if (!document) throw new Error(`No appliance document with id ${id}.`);
    return { documents: [document] };
  }
  return { documents: await service.documents.list({ applianceId, status, limit }) };
}));
server.registerTool('get_appliance_deadline', { title: 'Get appliance deadline', description: 'Retrieve one confirmed or suggested appliance deadline by id.', inputSchema: { id: z.string().min(1) }, annotations: READ }, async ({ id }) => safe(async () => {
  const deadline = await service.deadlines.get(id);
  if (!deadline) throw new Error(`No appliance deadline with id ${id}.`);
  return { deadline };
}));
server.registerTool('get_appliance_reminder', { title: 'Get appliance reminder', description: 'Retrieve one appliance reminder by id.', inputSchema: { id: z.string().min(1) }, annotations: READ }, async ({ id }) => safe(async () => {
  const reminder = await service.reminders.get(id);
  if (!reminder) throw new Error(`No appliance reminder with id ${id}.`);
  return { reminder };
}));
server.registerTool('get_upcoming_deadlines', { title: 'Get upcoming appliance deadlines', description: 'List upcoming warranty, service, AMC, EMI and return deadlines with their reminders.', inputSchema: { withinDays: z.number().int().min(1).max(730).optional(), type: z.enum(DEADLINE_TYPES).optional() }, annotations: READ }, async ({ withinDays, type }) => safe(async () => service.upcoming({ withinDays, type, today: date() })));
server.registerTool('list_appliance_reminders', { title: 'List appliance reminders', description: 'List appliance reminders, optionally filtered by appliance or lifecycle status.', inputSchema: { applianceId: z.string().optional(), status: z.enum(['suggested', 'approved', 'dismissed', 'completed', 'cancelled', 'all']).optional() }, annotations: READ }, async ({ applianceId, status }) => safe(async () => ({ reminders: await service.reminders.list({ applianceId, status }) })));

server.registerTool('confirm_appliance_document', { title: 'Confirm appliance document', description: 'Save a user-reviewed document: link it to an appliance and activate only the deadlines the user confirmed. Approval required.', inputSchema: { documentId: z.string().min(1), applianceId: z.string().optional(), fields: z.record(z.any()).optional(), deadlines: z.array(z.object({ index: z.number().int().nonnegative(), confirmed: z.literal(true), date: z.string().nullable().optional(), amount: z.union([z.string(), z.number()]).optional() })).optional() }, annotations: WRITE }, async ({ documentId, applianceId, fields, deadlines }) => safe(async () => service.confirmDocument({ documentId, applianceId, fields, deadlines, today: date() })));
server.registerTool('delete_appliance_document', { title: 'Delete appliance document', description: 'Delete a private appliance document and its linked deadlines/reminders. Approval required.', inputSchema: { id: z.string().min(1) }, annotations: WRITE }, async ({ id }) => safe(async () => { const deleted = await service.deleteDocument(id); await deleteUpload(deleted.storedName); return { documentId: deleted.id, deleted: true }; }));
server.registerTool('save_appliance', { title: 'Save appliance', description: 'Create or find an appliance from documented identity fields. Approval required.', inputSchema: fields, annotations: WRITE }, async (input) => safe(async () => {
  const appliance = await service.appliances.findOrCreate(input);
  if (!appliance) throw new Error('Provide at least a serial number, or a brand/model/name, to save an appliance.');
  return { appliance };
}));
server.registerTool('update_appliance', { title: 'Update appliance', description: 'Update confirmed appliance information. Approval required.', inputSchema: { id: z.string().min(1), ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])) }, annotations: WRITE }, async ({ id, ...changes }) => safe(async () => {
  const appliance = await service.updateAppliance(id, changes);
  return { appliance };
}));
server.registerTool('update_appliance_deadline', { title: 'Update appliance deadline', description: 'Correct a confirmed deadline date or status; reminders are refreshed automatically. Approval required.', inputSchema: { id: z.string().min(1), dueDate: z.string().optional(), title: z.string().optional(), status: z.enum(['active', 'completed', 'cancelled']).optional() }, annotations: WRITE }, async ({ id, ...changes }) => safe(async () => {
  if (changes.dueDate && !parseDate(changes.dueDate)) throw new Error('dueDate must be a real date (YYYY-MM-DD or DD/MM/YYYY).');
  if (changes.dueDate) changes.dueDate = parseDate(changes.dueDate);
  return { deadline: await service.updateDeadline(id, changes, { today: date() }) };
}));
server.registerTool('create_appliance_reminder', { title: 'Create appliance reminder', description: 'Create a reminder from a confirmed deadline. Approval required.', inputSchema: { deadlineId: z.string().min(1), windowDays: z.number().int().min(0).max(365) }, annotations: WRITE }, async ({ deadlineId, windowDays }) => safe(async () => ({ reminder: await service.createReminder(deadlineId, windowDays) })));
server.registerTool('update_appliance_reminder', { title: 'Update appliance reminder', description: 'Keep, approve, dismiss or complete an appliance reminder. Approval required.', inputSchema: { id: z.string().min(1), status: z.enum(['suggested', 'approved', 'dismissed', 'completed', 'cancelled']).optional(), windowDays: z.number().int().min(0).max(365).optional() }, annotations: WRITE }, async ({ id, status, windowDays }) => safe(async () => {
  const reminder = windowDays !== undefined ? await service.reminders.updateWindow(id, windowDays) : null;
  const updated = status ? await service.reminders.setStatus(id, status) : reminder;
  if (!updated) throw new Error(`No appliance reminder with id ${id}.`);
  return { reminder: updated };
}));
server.registerTool('reconcile_appliance_reminders', { title: 'Reconcile appliance reminders', description: 'Refresh reminders for an appliance after a confirmed date change, preserving dismissed and completed states. Approval required.', inputSchema: { applianceId: z.string().min(1), windows: z.array(z.number().int().min(0).max(365)).optional() }, annotations: WRITE }, async ({ applianceId, windows }) => safe(async () => ({ reminders: await service.reconcile(applianceId, { windows: parseWindows(windows), today: date() }) })));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await closeDatabase(); process.exit(0); });
await serve(server);
