#!/usr/bin/env node
// Wardrobe records and outfit recommendations, persisted in a small local JSON store.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, WRITE } from './lib/kit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.WEAVE_WARDROBE_FILE || path.join(root, 'data', 'wardrobe.json');
const clean = (value) => String(value ?? '').trim();
const owner = (value) => clean(value) || 'default';
const publicItem = ({ ownerId, ...item }) => item;

async function readItems(ownerId = 'default') {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

async function writeItems(items) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2));
  await fs.rename(tmp, file);
}

const ownerField = { owner_id: z.string().min(1).max(128).optional() };
const itemFields = {
  name: z.string().min(2), brand: z.string().optional(), category: z.string().min(2),
  color: z.string().optional(), size: z.string().optional(), occasion: z.string().optional(),
  season: z.string().optional(), notes: z.string().optional(), imageName: z.string().optional(),
  imageData: z.string().max(350_000).optional(),
  status: z.enum(['active', 'archived']).optional(),
};
const server = createServer('weave-wardrobe');

server.registerTool('list_wardrobe_items', { title: 'List wardrobe items', description: 'Browse only this user’s saved wardrobe garments with optional category and occasion filters.', inputSchema: { ...ownerField, category: z.string().optional(), occasion: z.string().optional(), status: z.enum(['active', 'archived', 'all']).optional() }, annotations: READ }, async ({ owner_id, category, occasion, status = 'active' }) => {
  let items = (await readItems()).filter((item) => owner(item.ownerId) === owner(owner_id));
  if (status !== 'all') items = items.filter((item) => item.status === status);
  if (category) items = items.filter((item) => item.category.toLowerCase() === category.toLowerCase());
  if (occasion) items = items.filter((item) => item.occasion?.toLowerCase().includes(occasion.toLowerCase()));
  return ok({ items: items.map(publicItem) });
});

server.registerTool('get_wardrobe_item', { title: 'Get wardrobe item', description: 'Retrieve one saved wardrobe garment belonging to this user.', inputSchema: { ...ownerField, id: z.string().min(1) }, annotations: READ }, async ({ owner_id, id }) => {
  const item = (await readItems()).find((entry) => owner(entry.ownerId) === owner(owner_id) && entry.id === id);
  return item ? ok({ item: publicItem(item) }) : fail(`No wardrobe item with id ${id}.`);
});

server.registerTool('search_wardrobe', { title: 'Search wardrobe', description: 'Search this user’s saved garments by name, brand, color, category or occasion.', inputSchema: { ...ownerField, query: z.string().min(2) }, annotations: READ }, async ({ owner_id, query }) => {
  const q = query.toLowerCase();
  const items = (await readItems()).filter((item) => owner(item.ownerId) === owner(owner_id) && Object.values(item).some((value) => String(value ?? '').toLowerCase().includes(q)));
  return ok({ query, items: items.map(publicItem) });
});

server.registerTool('save_wardrobe_item', { title: 'Save wardrobe item', description: 'Save a reviewed garment to this user’s wardrobe.', inputSchema: { ...ownerField, ...itemFields }, annotations: WRITE }, async ({ owner_id, ...input }) => {
  const items = await readItems();
  const item = { id: `wardrobe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, ownerId: owner(owner_id), ...input, name: clean(input.name), category: clean(input.category), status: input.status ?? 'active', createdAt: new Date().toISOString() };
  items.unshift(item);
  await writeItems(items);
  return ok({ item: publicItem(item) });
});

server.registerTool('update_wardrobe_item', { title: 'Update wardrobe item', description: 'Update confirmed metadata in this user’s wardrobe.', inputSchema: { ...ownerField, id: z.string(), ...Object.fromEntries(Object.entries(itemFields).map(([key, schema]) => [key, schema.optional()])) }, annotations: WRITE }, async ({ owner_id, id, ...changes }) => {
  const items = await readItems();
  const index = items.findIndex((item) => owner(item.ownerId) === owner(owner_id) && item.id === id);
  if (index < 0) return fail(`No wardrobe item with id ${id}.`);
  items[index] = { ...items[index], ...changes, updatedAt: new Date().toISOString() };
  await writeItems(items);
  return ok({ item: publicItem(items[index]) });
});

server.registerTool('delete_wardrobe_item', { title: 'Delete wardrobe item', description: 'Archive a wardrobe garment belonging to this user.', inputSchema: { ...ownerField, id: z.string() }, annotations: WRITE }, async ({ owner_id, id }) => {
  const items = await readItems();
  const index = items.findIndex((item) => owner(item.ownerId) === owner(owner_id) && item.id === id);
  if (index < 0) return fail(`No wardrobe item with id ${id}.`);
  items[index] = { ...items[index], status: 'archived', updatedAt: new Date().toISOString() };
  await writeItems(items);
  return ok({ item: publicItem(items[index]) });
});

server.registerTool('recommend_outfits', { title: 'Recommend outfits', description: 'Suggest combinations using only this user’s active wardrobe garments for an occasion.', inputSchema: { ...ownerField, occasion: z.string().optional(), limit: z.number().int().min(1).max(10).optional() }, annotations: READ }, async ({ owner_id, occasion = '', limit = 3 }) => {
  const items = (await readItems()).filter((item) => owner(item.ownerId) === owner(owner_id) && item.status === 'active');
  if (!items.length) return ok({ occasion, outfits: [], wardrobe_item_ids: [], empty: true, reason: 'Upload and save clothing in Wardrobe before asking for an outfit.' });
  const target = occasion.toLowerCase().trim();
  const matchesOcc = (it) => Boolean(target && it.occasion?.toLowerCase().includes(target));
  const score = (it) => (matchesOcc(it) ? 2 : 1);
  const sorted = [...items].sort((a, b) => score(b) - score(a));

  const tops = sorted.filter((i) => /^(top|shirt|blouse|t-shirt|tee|kurta)s?$/i.test(i.category));
  const bottoms = sorted.filter((i) => /^(bottom|trouser|pant|jeans|skirt|shorts)s?$/i.test(i.category));
  const onePiece = sorted.filter((i) => /^(dress|dresses|ethnic|saree|jumpsuit|suit)$/i.test(i.category));
  const footwear = sorted.filter((i) => /^(footwear|shoes|heels|sneakers|juttis)$/i.test(i.category));

  const outfits = [];
  const usedPairs = new Set();

  // 1. Pair tops + bottoms (+ optional footwear) when both exist
  for (const top of tops) {
    for (const bottom of bottoms) {
      if (outfits.length >= limit) break;
      const key = `${top.id}+${bottom.id}`;
      if (usedPairs.has(key)) continue;
      usedPairs.add(key);
      const combo = [top, bottom];
      if (footwear.length) combo.push(footwear[0]);
      const anyMatch = combo.some(matchesOcc);
      outfits.push({
        id: `outfit_${top.id}_${bottom.id}`,
        items: combo.map(publicItem),
        explanation: anyMatch ? `Paired for ${occasion} from your saved top & bottom.` : 'Balanced top and bottom pairing from your wardrobe.',
      });
    }
  }

  // 2. Include one-piece garments (dresses / ethnic)
  for (const piece of onePiece) {
    if (outfits.length >= limit) break;
    const combo = footwear.length ? [piece, footwear[0]] : [piece];
    outfits.push({
      id: `outfit_${piece.id}`,
      items: combo.map(publicItem),
      explanation: matchesOcc(piece) ? `Matches the ${occasion} occasion.` : 'Complete look from your active wardrobe.',
    });
  }

  // 3. Fallback to individual saved items if no pairs/one-pieces filled the list
  if (!outfits.length) {
    for (const item of sorted.slice(0, limit)) {
      outfits.push({
        id: item.id,
        items: [publicItem(item)],
        explanation: matchesOcc(item) ? `Matches the ${occasion} occasion.` : 'A saved active wardrobe item.',
      });
    }
  }

  const wardrobe_item_ids = [...new Set(outfits.flatMap((o) => o.items.map((it) => it.id)))];
  return ok({ occasion, outfits, wardrobe_item_ids, empty: outfits.length === 0 });
});

await serve(server);
