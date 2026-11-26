#!/usr/bin/env node
// Weave demo MCP server: Wishlist and personal size intelligence (sample data, in memory).
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, WRITE } from './lib/kit.js';
import { wishlistItems, sizeProfile, sizeCharts } from './lib/sample-data.js';
import { matchSize } from '../lib/size-matcher.js';

const items = wishlistItems();
let profile = sizeProfile();
const charts = sizeCharts();
let created = 0;
const text = (v) => String(v ?? '').trim().toLowerCase();
const itemSchema = { product_name: z.string().min(2), brand: z.string().min(1), product_url: z.string().url(), image_url: z.string().url().optional(), category: z.string().min(2), occasion: z.string().min(2).optional(), notes: z.string().optional(), product_id: z.string().min(1).optional() };
const server = createServer('weave-wishlist');

server.registerTool('list_wishlist_items', { title: 'List wishlist items', description: 'List saved wishlist products with optional occasion, brand, category, or status filters.', inputSchema: { occasion: z.string().optional(), brand: z.string().optional(), category: z.string().optional(), status: z.enum(['saved', 'purchased', 'archived', 'all']).optional() }, annotations: READ }, async ({ occasion, brand, category, status = 'saved' }) => ok({ source: 'sample data', items: items.filter((x) => (status === 'all' || x.status === status) && (!occasion || text(x.occasion) === text(occasion)) && (!brand || text(x.brand) === text(brand)) && (!category || text(x.category) === text(category))) }));

server.registerTool('search_wishlist', { title: 'Search wishlist', description: 'Search saved products by keywords, brand, category, or occasion.', inputSchema: { query: z.string().min(2), limit: z.number().int().min(1).max(50).optional() }, annotations: READ }, async ({ query, limit = 10 }) => {
  const terms = text(query).split(/\s+/).filter(Boolean);
  const result = items.map((item) => ({ item, score: terms.reduce((n, term) => n + Object.values(item).filter((v) => text(v).includes(term)).length, 0) })).filter((x) => x.score).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.item);
  return ok({ query, items: result });
});

server.registerTool('get_wishlist_item', { title: 'Get wishlist item', description: 'Retrieve one saved product by id.', inputSchema: { id: z.string().min(1) }, annotations: READ }, async ({ id }) => { const item = items.find((x) => x.id === id); return item ? ok({ item }) : fail(`No wishlist item with id ${id}.`); });

server.registerTool('save_wishlist_item', { title: 'Save wishlist item', description: 'Save a product to the wishlist. This changes wishlist data.', inputSchema: itemSchema, annotations: WRITE }, async (input) => {
  const duplicate = items.find((x) => (input.product_id && x.product_id === input.product_id) || (text(x.product_url) === text(input.product_url)));
  if (duplicate) return fail(`This product is already saved (${duplicate.id}).`);
  created += 1; const item = { id: `wish_${100 + created}`, kind: 'wishlist_item', ...input, product_id: input.product_id ?? null, occasion: input.occasion ?? '', notes: input.notes ?? '', status: 'saved', source: 'sample data', created_by: 'Weave (approved by you)' }; items.push(item); return ok({ item });
});

server.registerTool('update_wishlist_item', { title: 'Update wishlist item', description: 'Update an existing saved wishlist product.', inputSchema: { id: z.string(), ...Object.fromEntries(Object.entries(itemSchema).map(([k, schema]) => [k, schema.optional()])) }, annotations: WRITE }, async ({ id, ...changes }) => { const item = items.find((x) => x.id === id); if (!item) return fail(`No wishlist item with id ${id}.`); Object.assign(item, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined))); return ok({ item }); });
server.registerTool('delete_wishlist_item', { title: 'Delete wishlist item', description: 'Delete a saved wishlist product.', inputSchema: { id: z.string() }, annotations: WRITE }, async ({ id }) => { const index = items.findIndex((x) => x.id === id); if (index < 0) return fail(`No wishlist item with id ${id}.`); const [item] = items.splice(index, 1); return ok({ deleted: item }); });

server.registerTool('get_size_profile', { title: 'Get size profile', description: 'Retrieve the clearly labelled sample personal size profile when size matching requires it.', inputSchema: {}, annotations: READ }, async () => ok({ profile: { ...profile, sample: true, privacy: 'Sensitive measurements; use only for size matching.' } }));
server.registerTool('update_size_profile', { title: 'Update size profile', description: 'Update sensitive measurements and fit preferences. This change requires approval.', inputSchema: { bust: z.number().positive().optional(), waist: z.number().positive().optional(), hips: z.number().positive().optional(), shoulder: z.number().positive().optional(), inseam: z.number().positive().optional(), height: z.number().positive().optional(), unit: z.enum(['cm', 'inches']).optional(), preferred_fit: z.enum(['slim', 'regular', 'oversized']).optional(), preferred_categories: z.array(z.string().min(2)).max(20).optional() }, annotations: WRITE }, async (changes) => { const measurementKeys = ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height']; for (const key of measurementKeys) if (changes[key] !== undefined) profile.measurements[key] = changes[key]; if (changes.unit) profile.unit = changes.unit; if (changes.preferred_fit) profile.preferred_fit = changes.preferred_fit; if (changes.preferred_categories) profile.preferred_categories = changes.preferred_categories; return ok({ profile: { ...profile, sample: true, privacy: 'Sensitive measurements; use only for size matching.' } }); });
server.registerTool('get_brand_size_chart', { title: 'Get synthetic brand size chart', description: 'Retrieve a synthetic, clearly labelled chart for a brand/category/region.', inputSchema: { brand: z.string(), category: z.string(), region: z.string().optional() }, annotations: READ }, async ({ brand, category, region }) => { const chart = charts.find((x) => text(x.brand) === text(brand) && text(x.category) === text(category) && (!region || text(x.region) === text(region))); return chart ? ok({ chart }) : ok({ status: 'unavailable', reason: 'No size chart is available for that brand, category, and region.' }); });
server.registerTool('match_product_size', { title: 'Match product size', description: 'Return a deterministic measurement-based recommendation from the private sample profile and a synthetic chart.', inputSchema: { item_id: z.string().optional(), brand: z.string().optional(), category: z.string().optional(), region: z.string().optional() }, annotations: READ }, async ({ item_id, brand, category, region }) => { const item = item_id ? items.find((x) => x.id === item_id) : null; const targetBrand = brand ?? item?.brand; const targetCategory = category ?? item?.category; const chart = charts.find((x) => text(x.brand) === text(targetBrand) && text(x.category) === text(targetCategory) && (!region || text(x.region) === text(region))); if (!chart) return ok({ status: 'unavailable', reason: 'No size chart is available for this saved product/category.' }); return ok({ item: item ?? null, match: matchSize(profile, chart, { category: targetCategory }) }); });

await serve(server);

