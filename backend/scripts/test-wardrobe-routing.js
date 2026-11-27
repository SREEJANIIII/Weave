import assert from 'node:assert/strict';
import { Run } from '../src/run.js';
import { runOffline } from '../src/agent-offline.js';
import { runNvidia } from '../src/agent-nvidia.js';
import { isWardrobeQuestion, validWardrobeItems } from '../lib/wardrobe-routing.js';

const wardrobeItems = [
  { id: 'wardrobe-1', name: 'Blue shirt', category: 'top', occasion: 'college', kind: 'wardrobe_item' },
  { id: 'wardrobe-2', name: 'Black trousers', category: 'bottom', occasion: 'college', kind: 'wardrobe_item' },
];
const wishlistItems = Array.from({ length: 10 }, (_, index) => ({ id: `wishlist-${index}`, product_name: `Wishlist dress ${index}`, kind: 'wishlist_item' }));

function fakeHub(items = wardrobeItems) {
  const defs = new Map([
    ['wardrobe', { name: 'Wardrobe' }],
    ['calendar', { name: 'Calendar' }],
    ['wishlist', { name: 'Wishlist & sizes' }],
  ]);
  const calls = [];
  return {
    calls,
    servers: new Map([...defs].map(([id, def]) => [id, { def }])),
    isAvailable: (id) => id !== 'wishlist',
    findTool: () => ({ annotations: { readOnlyHint: true } }),
    availableTools: () => [
      { server: 'wardrobe', app: 'Wardrobe', tool: { name: 'list_wardrobe_items', description: 'owned garments', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } } },
      { server: 'wardrobe', app: 'Wardrobe', tool: { name: 'recommend_outfits', description: 'owned outfit combinations', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } } },
      { server: 'wishlist', app: 'Wishlist & sizes', tool: { name: 'list_wishlist_items', description: 'shopping products', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } } },
      { server: 'calendar', app: 'Calendar', tool: { name: 'list_events', description: 'schedule', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } } },
    ],
    log: () => {},
    async call(server, tool) {
      calls.push({ server, tool });
      if (server === 'wardrobe' && tool === 'list_wardrobe_items') return { isError: false, data: { items }, ms: 1 };
      if (server === 'wardrobe' && tool === 'recommend_outfits') return { isError: false, data: { outfits: items.map((item) => ({ id: item.id, items: [item] })) }, ms: 1 };
      if (server === 'calendar') return { isError: false, data: { events: [{ id: 'calendar-1', kind: 'event', title: 'College', date: '2026-11-28' }] }, ms: 1 };
      return { isError: true, text: 'unexpected tool', ms: 1 };
    },
  };
}

assert.equal(isWardrobeQuestion('Suggest an outfit for college.'), true);
assert.equal(isWardrobeQuestion('What should I wear tomorrow?'), true);
assert.equal(isWardrobeQuestion('What should I buy for college?'), false);
assert.deepEqual(validWardrobeItems([{ id: 'wardrobe-1' }, { id: 'wishlist-1' }], ['wardrobe-1']), [{ id: 'wardrobe-1' }]);

const hub = fakeHub();
const run = new Run({ hub, proposals: { add: (item) => item }, question: 'I have college from 9–4. Suggest an outfit using my wardrobe.', mode: 'offline', emit: () => {} });
const answer = await runOffline(run);
assert.ok(run.steps.every((step) => step.server !== 'wishlist'), 'wardrobe recommendation never invokes Wishlist');
assert.ok(run.steps.some((step) => step.server === 'wardrobe' && step.tool === 'list_wardrobe_items'));
assert.ok(run.steps.some((step) => step.server === 'calendar' && step.tool === 'list_events'));
assert.ok(answer.sections.flatMap((section) => section.items).every((item) => item.sourceIds.every((id) => id.startsWith('wardrobe:') || id.startsWith('calendar:'))));

const emptyRun = new Run({ hub: fakeHub([]), proposals: { add: (item) => item }, question: 'Create an outfit using my wardrobe.', mode: 'offline', emit: () => {} });
const emptyAnswer = await runOffline(emptyRun);
assert.match(emptyAnswer.headline, /empty/i);
assert.match(emptyAnswer.caveats.join(' '), /upload|wishlist/i);

let plannerTools;
const nvidiaRun = new Run({ hub, proposals: { add: (item) => item }, question: 'Suggest an outfit using my wardrobe for college.', mode: 'nvidia', emit: () => {} });
await runNvidia(nvidiaRun, { client: { chat: { completions: { create: async ({ tools }) => { plannerTools = tools.map((entry) => entry.function.name); return { choices: [{ message: { tool_calls: [{ id: 'answer', function: { name: 'present_answer', arguments: JSON.stringify({ headline: 'ok', sections: [], caveats: [] }) } }] } }] }; } } } } });
assert.ok(plannerTools.includes('wardrobe__list_wardrobe_items'));
assert.ok(plannerTools.includes('calendar__list_events'));
assert.ok(!plannerTools.some((name) => name.startsWith('wishlist__')));

console.log('  ✓ wardrobe routing keeps outfit recommendations on Wardrobe, allows Calendar context, rejects Wishlist IDs, and handles empty inventory');
