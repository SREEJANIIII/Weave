#!/usr/bin/env node
// Wishlist, size intelligence, and reminder MCP tools backed by MongoDB Atlas.
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, WRITE } from './lib/kit.js';
import { wishlistItems, sizeProfile, sizeCharts } from './lib/sample-data.js';
import { matchSize, normaliseCategory } from '../lib/size-matcher.js';
import { connectDatabase, closeDatabase } from '../db/database.js';
import { WishlistRepository } from '../repositories/wishlist-repository.js';
import { SizeProfileRepository } from '../repositories/size-profile-repository.js';
import { ReminderRepository } from '../repositories/reminder-repository.js';

await connectDatabase();
const wishlist = new WishlistRepository();
const profiles = new SizeProfileRepository();
const reminders = new ReminderRepository();
if (await wishlist.count() === 0) await wishlist.seed(wishlistItems());
await profiles.seed(sizeProfile());
const charts = sizeCharts();
const text = (value) => String(value ?? '').trim().toLowerCase();
const findChart = (brand, category, region) =>
  charts.find(
    (x) =>
      text(x.brand) === text(brand) &&
      normaliseCategory(x.category) === normaliseCategory(category) &&
      (!region || text(x.region) === text(region)),
  );
const itemFields = { product_name: z.string().min(2), brand: z.string().min(1), product_url: z.string().url(), image_url: z.string().url().optional(), category: z.string().min(2), occasion: z.string().min(2).optional(), notes: z.string().optional(), description: z.string().optional(), price: z.number().nonnegative().optional(), status: z.enum(['saved', 'purchased', 'archived']).optional(), product_id: z.string().min(1).optional() };
const server = createServer('weave-wishlist');

server.registerTool('list_wishlist_items', { title: 'List wishlist items', description: 'List saved wishlist products with optional filters.', inputSchema: { occasion: z.string().optional(), brand: z.string().optional(), category: z.string().optional(), status: z.enum(['saved', 'purchased', 'archived', 'all']).optional() }, annotations: READ }, async (input) => ok({ source: 'persistent MongoDB data', items: await wishlist.list(input) }));
server.registerTool('search_wishlist', { title: 'Search wishlist', description: 'Search saved products by keyword, brand, category, or occasion.', inputSchema: { query: z.string().min(2), limit: z.number().int().min(1).max(50).optional() }, annotations: READ }, async ({ query, limit = 10 }) => ok({ query, items: await wishlist.search(query, limit) }));
server.registerTool('get_wishlist_item', { title: 'Get wishlist item', description: 'Retrieve one saved product by id.', inputSchema: { id: z.string().min(1) }, annotations: READ }, async ({ id }) => { const item = await wishlist.get(id); return item ? ok({ item }) : fail(`No wishlist item with id ${id}.`); });
server.registerTool('save_wishlist_item', { title: 'Save wishlist item', description: 'Save a product. This changes persistent wishlist data.', inputSchema: itemFields, annotations: WRITE }, async (input) => { try { return ok({ item: await wishlist.save(input) }); } catch (error) { return fail(error.code === 11000 ? 'This product is already saved.' : `Could not save wishlist item: ${error.message}`); } });
server.registerTool('update_wishlist_item', { title: 'Update wishlist item', description: 'Update a saved wishlist product.', inputSchema: { id: z.string(), ...Object.fromEntries(Object.entries(itemFields).map(([key, schema]) => [key, schema.optional()])) }, annotations: WRITE }, async ({ id, ...changes }) => { try { const item = await wishlist.update(id, changes); return item ? ok({ item }) : fail(`No wishlist item with id ${id}.`); } catch (error) { return fail(`Could not update wishlist item: ${error.message}`); } });
server.registerTool('delete_wishlist_item', { title: 'Delete wishlist item', description: 'Delete a saved wishlist product.', inputSchema: { id: z.string() }, annotations: WRITE }, async ({ id }) => { const deleted = await wishlist.delete(id); return deleted ? ok({ deleted }) : fail(`No wishlist item with id ${id}.`); });

server.registerTool('get_size_profile', { title: 'Get size profile', description: 'Retrieve the private size profile only when explicitly needed for size work.', inputSchema: {}, annotations: READ }, async () => { const profile = await profiles.get(); return profile ? ok({ profile: { ...profile, privacy: 'Sensitive measurements; do not share with unrelated tools.' } }) : ok({ status: 'unavailable', reason: 'No size profile is saved.' }); });
server.registerTool('update_size_profile', { title: 'Update size profile', description: 'Update sensitive measurements or fit preferences. Approval required.', inputSchema: { bust: z.number().positive().nullable().optional(), waist: z.number().positive().nullable().optional(), hips: z.number().positive().nullable().optional(), shoulder: z.number().positive().nullable().optional(), inseam: z.number().positive().nullable().optional(), height: z.number().positive().nullable().optional(), unit: z.enum(['cm', 'inches']).optional(), preferred_fit: z.enum(['slim', 'regular', 'oversized']).optional(), preferred_categories: z.array(z.string().min(2)).max(20).optional() }, annotations: WRITE }, async (changes) => { try { const profile = await profiles.update(changes); return profile ? ok({ profile: { id: profile.id, unit: profile.unit, preferred_fit: profile.preferred_fit, preferred_categories: profile.preferred_categories, encrypted: Boolean(profile.encrypted), updated: true } }) : fail('No size profile is saved.'); } catch (error) { return fail(`Could not update size profile: ${error.message}`); } });
server.registerTool('delete_size_profile', { title: 'Delete size profile', description: 'Permanently remove the saved sensitive size profile. Approval required.', inputSchema: {}, annotations: WRITE }, async () => { await profiles.delete(); return ok({ deleted: true, kind: 'size_profile_deletion' }); });
server.registerTool('get_brand_size_chart', { title: 'Get synthetic brand size chart', description: 'Retrieve a synthetic chart for a brand, category, and region.', inputSchema: { brand: z.string(), category: z.string(), region: z.string().optional() }, annotations: READ }, async ({ brand, category, region }) => { const chart = findChart(brand, category, region); return chart ? ok({ chart }) : ok({ status: 'unavailable', reason: 'No size chart is available for that brand, category, and region.' }); });
server.registerTool('match_product_size', { title: 'Match product size', description: 'Return a deterministic measurement-based recommendation without returning the complete profile.', inputSchema: { item_id: z.string().optional(), brand: z.string().optional(), category: z.string().optional(), region: z.string().optional() }, annotations: READ }, async ({ item_id, brand, category, region }) => { const item = item_id ? await wishlist.get(item_id) : null; const targetBrand = brand ?? item?.brand; const targetCategory = category ?? item?.category; const chart = findChart(targetBrand, targetCategory, region); if (!chart) return ok({ status: 'unavailable', reason: 'No size chart is available for this saved product/category.' }); const profile = await profiles.get(); return profile ? ok({ item, match: matchSize(profile, chart, { category: targetCategory }) }) : ok({ item, status: 'unavailable', reason: 'No size profile is saved.' }); });

server.registerTool('list_reminders', { title: 'List occasion reminders', description: 'List persistent reminder records, optionally by lifecycle status.', inputSchema: { status: z.enum(['suggested', 'pending_approval', 'approved', 'dismissed', 'completed', 'cancelled']).optional() }, annotations: READ }, async ({ status }) => ok({ reminders: await reminders.list(status) }));
server.registerTool('reconcile_reminders', { title: 'Reconcile occasion reminders', description: 'Persist deduplicated reminder suggestions from current calendar and wishlist records. Approval required.', inputSchema: { items: z.array(z.object({ id: z.string(), occasion: z.string(), status: z.string() })), events: z.array(z.object({ id: z.string(), title: z.string(), date: z.string(), occasion: z.string().optional() })), windows: z.array(z.union([z.literal(30), z.literal(14), z.literal(7)])).optional() }, annotations: WRITE }, async ({ items, events, windows }) => ok(await reminders.reconcile(items, events, windows)));
server.registerTool('dismiss_reminder', { title: 'Dismiss occasion reminder', description: 'Keep a reminder dismissed so it does not reappear. Approval required.', inputSchema: { id: z.string() }, annotations: WRITE }, async ({ id }) => { const reminder = await reminders.dismiss(id); return reminder ? ok({ reminder }) : fail(`No reminder with id ${id}.`); });

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await closeDatabase(); process.exit(0); });
await serve(server);
