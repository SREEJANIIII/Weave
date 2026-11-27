// Offline planner: a fixed, scripted plan for the two demo questions. It makes the same real MCP
// calls as the NVIDIA planner and follows the same rules (cite what you read, draft changes, never
// run them), but the reasoning is hand-written, so it only understands these two questions.
import { now, isoDate, lastWeek, fmtRange, fmtTime, fmtDay, fmtMoney, fmtRelative, shortWeekday, toMinutes, fromMinutes, addDays } from '../lib/dates.js';
import { isWardrobeQuestion, validWardrobeItems } from '../lib/wardrobe-routing.js';
import { isTimetableQuestion } from '../lib/timetable-routing.js';

export const DEMO_QUESTIONS = [
  'What should I follow up on today, and when can I fit in a workout?',
  'How much did I spend on food last week, and what was happening on those days?',
];

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const count = (n) => NUMBER_WORDS[n] ?? String(n);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const STOP = new Set(['the', 'and', 'with', 'for', 'team', 'from', 'that', 'this', 'about']);
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
/** Share of the smaller title's words that also appear in the other title. */
function overlap(a, b) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  return [...A].filter((w) => B.has(w)).length / Math.min(A.size, B.size);
}

/** "(by Tue)" -> the next date that falls on that weekday (today included). */
function dueFromText(text, today) {
  const m = text.match(/\(by (\w{3})\w*\)/i);
  if (!m) return null;
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(today, i);
    if (shortWeekday(d).toLowerCase() === m[1].toLowerCase()) return isoDate(d);
  }
  return null;
}

/** Reads "Runs: Tue, Thu, Sat — 45 min", "Best window: 18:00–20:00", "Keep 15 minutes free". */
function parsePlan(body) {
  const runs = body.match(/Runs:\s*([A-Za-z, ]+?)\s*[—-]+\s*(\d+)\s*min/);
  if (!runs) return null;
  const win = body.match(/Best window:\s*(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  const buf = body.match(/Keep (\d+) minutes free/);
  return {
    days: runs[1].split(',').map((d) => d.trim().slice(0, 3)),
    minutes: Number(runs[2]),
    window: win ? [win[1], win[2]] : ['17:00', '21:00'],
    buffer: buf ? Number(buf[1]) : 0,
  };
}

export async function runOffline(run) {
  const q = run.question.toLowerCase();
  const appliance = /warrant|amc|\bemi\b|appliance|servic|return|replace|washing machine|refrigerator|\bac\b/.test(q);
  if (appliance) return run.finish(await appliances(run));
  if (isTimetableQuestion(run.question)) return run.finish(await timetable(run));
  if (isWardrobeQuestion(run.question)) return run.finish(await wardrobeAndOutfits(run));
  const wishlist = /wishlist|saved|diwali|wedding|birthday|occasion|size|outfit|product/.test(q);
  if (wishlist) return run.finish(await wishlistAndOccasions(run));
  const daily = /follow[\s-]?up|to-?dos?|action items?|workout|exercise|\brun\b|gym|fit in/.test(q);
  const money = /\bspen[dt]|spending|food|expens|money/.test(q);
  if (money && !daily) return run.finish(await spending(run));
  if (daily) return run.finish(await followUpsAndWorkout(run));
  return run.finish({
    headline: 'Offline mode can only answer the two demo questions.',
    sections: [{ title: 'Try one of these', items: DEMO_QUESTIONS.map((text) => ({ text, detail: '', source_ids: [] })) }],
    caveats: ['Switch the planner to NVIDIA (top right) to ask anything across your connected apps.'],
  });
}

async function timetable(run) {
  const q = run.question.toLowerCase();
  const rawAfter = q.match(/after\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const afterTime = rawAfter ? `${String((Number(rawAfter[1]) + (rawAfter[3]?.toLowerCase() === 'pm' && Number(rawAfter[1]) < 12 ? 12 : 0)) % 24).padStart(2, '0')}:${rawAfter[2] ?? '00'}` : undefined;
  if (!run.hub.isAvailable('timetable')) return { headline: "Your Timetable is switched off, so I can't check classes.", sections: [], caveats: ['Upload and confirm a timetable first.'] };
  const subject = q.match(/\b(dsa|dbms|java|python|math(?:s)?|physics|chemistry)\b/i)?.[1];
  const day = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].find((name) => q.includes(name));
  let result;
  if (/free/.test(q)) result = await run.read('timetable', 'get_free_slots', { day: day ? day[0].toUpperCase() + day.slice(1) : 'Tuesday', afterTime });
  else if (/after\s+\w+/i.test(q) && day) result = await run.read('timetable', 'get_classes_for_day', { day: day[0].toUpperCase() + day.slice(1) });
  else if (subject) result = await run.read('timetable', 'get_next_class_by_subject', { subject });
  else if (/last class/.test(q) && day) result = await run.read('timetable', 'get_classes_for_day', { day: day[0].toUpperCase() + day.slice(1) });
  else if (day) result = await run.read('timetable', 'get_classes_for_day', { day: day[0].toUpperCase() + day.slice(1) });
  else result = await run.read('timetable', 'get_next_class', {});
  if (!result.ok) return { headline: "I couldn't read your confirmed timetable.", sections: [], caveats: [result.error] };
  const data = result.raw ?? {};
  if (data.slots) return { headline: `You have ${data.slots.length} free period${data.slots.length === 1 ? '' : 's'} on ${data.day} after the requested time.`, sections: [{ title: 'Free periods', items: data.slots.map((slot) => ({ text: `${slot.startTime}–${slot.endTime}`, detail: 'No confirmed class overlaps this interval.', source_ids: [] })) }], caveats: ['Timetable entries repeat weekly; no calendar date was invented.'] };
  const list = data.entries ?? (data.entry ? [data.entry] : []);
  if (!list.length) return { headline: 'No confirmed timetable entry matched that question.', sections: [], caveats: ['Upload or confirm the timetable, or check the subject/day spelling.'] };
  const afterSubject = q.match(/after\s+([a-z0-9]+)/i)?.[1];
  const afterIndex = afterSubject ? list.findIndex((item) => item.subject.toLowerCase().includes(afterSubject.toLowerCase())) : -1;
  const selected = /last class/.test(q) ? [list[list.length - 1]] : afterIndex >= 0 ? list.slice(afterIndex + 1, afterIndex + 2) : list;
  return { headline: selected.length === 1 ? `${selected[0].subject} is on ${selected[0].day} from ${selected[0].startTime} to ${selected[0].endTime}.` : `${selected.length} classes are scheduled on ${selected[0].day}.`, sections: [{ title: 'Confirmed timetable', items: selected.map((item) => ({ text: `${item.subject}: ${item.startTime}–${item.endTime}`, detail: [item.classType, item.location].filter(Boolean).join(' · '), source_ids: [`timetable:${item.id}`] })) }], caveats: ['These are recurring weekday classes; no calendar date was invented.'] };
}

async function wardrobeAndOutfits(run) {
  const has = (id) => run.hub.isAvailable(id);
  if (!has('wardrobe')) return { headline: "Wardrobe is switched off, so I can't use your owned garments.", sections: [], caveats: ['Turn on Wardrobe and upload clothing before asking for an outfit.'] };
  const inventory = await run.read('wardrobe', 'list_wardrobe_items', { status: 'active' });
  if (!inventory.ok) return { headline: "I couldn't read your Wardrobe inventory.", sections: [], caveats: [inventory.error] };
  const owned = inventory.raw?.items ?? [];
  if (!owned.length) return { headline: 'Your Wardrobe is empty.', sections: [], caveats: ['Upload and save clothing in Wardrobe before asking for an outfit. Wishlist products are not treated as owned clothing.'] };
  const allowed = new Set(owned.map((item) => item.id));
  const recommendation = await run.read('wardrobe', 'recommend_outfits', { occasion: run.question.match(/college|work|dinner|wedding|party|casual/i)?.[0] ?? '', limit: 3 });
  const outfits = (recommendation.raw?.outfits ?? []).filter((outfit) => validWardrobeItems(outfit.items, allowed).length === (outfit.items ?? []).length);
  let events = [];
  if (has('calendar') && /tomorrow|college|class|schedule|dinner|meeting|9\s*[-–]\s*4/i.test(run.question)) {
    const start = isoDate(addDays(now(), /tomorrow/i.test(run.question) ? 1 : 0));
    const result = await run.read('calendar', 'list_events', { date: start });
    events = result.raw?.events ?? [];
  }
  const sections = outfits.map((outfit) => ({ title: 'Wardrobe outfit', items: [{ text: outfit.items.map((item) => item.name).join(' + '), detail: `${outfit.explanation}${events.length ? ` Calendar context: ${events.map((event) => event.title).join(', ')}.` : ''}`, source_ids: outfit.items.map((item) => `wardrobe:${item.id}`).concat(events.map((event) => `calendar:${event.id}`)) }] }));
  return { headline: sections.length ? `I found ${sections.length} outfit option${sections.length === 1 ? '' : 's'} using your Wardrobe.` : 'I could not make a verified outfit from your Wardrobe.', sections, caveats: ['Only active garments retrieved from Wardrobe are eligible.'] };
}

async function wishlistAndOccasions(run) {
  const has = (id) => run.hub.isAvailable(id);
  if (!has('wishlist')) return { headline: "Wishlist is switched off, so I can't check saved products or sizes.", sections: [], caveats: ['Switch Wishlist & sizes back on in the left panel.'] };
  const list = await run.read('wishlist', 'list_wishlist_items', {});
  if (!list.ok) return { headline: "I couldn't read your wishlist.", sections: [], caveats: [list.error] };
  let saved = list.raw?.items ?? [];
  const q = run.question.toLowerCase();
  const occasion = ['diwali', 'wedding', 'birthday'].find((x) => q.includes(x));
  if (occasion) saved = saved.filter((x) => x.occasion.toLowerCase() === occasion);
  const sections = [];
  const items = [];
  let events = [];
  if (has('calendar')) {
    const today = isoDate(now());
    const window = q.match(/(30|14|7)\s*days?/i)?.[1] ?? '30';
    const end = isoDate(addDays(now(), Number(window)));
    const result = await run.read('calendar', 'list_events', { start_date: today, end_date: end });
    events = (result.raw?.events ?? []).filter((e) => e.occasion || /diwali|wedding|birthday/i.test(e.title));
    for (const event of events) {
      const matches = saved.filter((x) => x.occasion && (event.occasion ?? event.title).toLowerCase().includes(x.occasion.toLowerCase()) || x.occasion && event.title.toLowerCase().includes(x.occasion.toLowerCase()));
      for (const item of matches) items.push({ text: `${item.product_name} (${item.brand}) is saved for ${item.occasion}.`, detail: `Relevant calendar event: “${event.title}” on ${event.date}.`, source_ids: [`wishlist:${item.id}`, `calendar:${event.id}`] });
    }
  }
  if (!items.length && saved.length) for (const item of saved) items.push({ text: `${item.product_name} (${item.brand}) — saved for ${item.occasion || 'no occasion tag'}.`, detail: item.notes || '', source_ids: [`wishlist:${item.id}`] });
  if (items.length) sections.push({ title: events.length ? 'Saved for upcoming occasions' : 'Saved products', items: items.slice(0, 12) });
  if (/remind|reminder|upcoming occasion/.test(q) && events.length && has('calendar')) {
    const candidates = saved.filter((item) => events.some((event) => item.occasion && `${event.occasion ?? ''} ${event.title}`.toLowerCase().includes(item.occasion.toLowerCase())));
    if (candidates.length) run.propose('wishlist', 'reconcile_reminders', {
      items: candidates.map((item) => ({ id: item.id, occasion: item.occasion, status: item.status })),
      events: events.filter((event) => candidates.some((item) => item.occasion && `${event.occasion ?? ''} ${event.title}`.toLowerCase().includes(item.occasion.toLowerCase()))).map((event) => ({ id: event.id, title: event.title, date: event.date, occasion: event.occasion })),
      windows: [30, 14, 7],
    }, { why: 'These saved products match upcoming occasion events; approval will persist deduplicated reminder suggestions.', sourceIds: items.flatMap((item) => item.source_ids) });
  }

  if (/size|fit|measurements?/.test(q)) {
    const catMatch = saved.filter((x) => q.includes(x.category.toLowerCase()) || q.includes(x.brand.toLowerCase()) || q.includes(x.product_name.toLowerCase()));
    const targets = catMatch.length ? catMatch : (/outfits|all|saved|which of/.test(q) && !occasion ? saved.slice(0, 6) : saved.slice(0, 1));
    const sizeItems = [];
    for (const target of targets) {
      const match = await run.read('wishlist', 'match_product_size', { item_id: target.id });
      const result = match.raw?.match;
      if (result?.status === 'matched') {
        sizeItems.push({ text: `${target.product_name} (${target.brand}): consider ${result.recommendation}.`, detail: `${result.explanation} Confidence: ${result.confidence}. ${result.disclaimer}`, source_ids: [`wishlist:${target.id}`] });
      } else {
        sizeItems.push({ text: `${target.product_name} (${target.brand}): no verified size recommendation available.`, detail: result?.reason ?? match.raw?.reason ?? 'No matching chart was found.', source_ids: [`wishlist:${target.id}`] });
      }
    }
    if (sizeItems.length) sections.push({ title: 'Measurement-based size recommendations', items: sizeItems });
  }
  const headline = items.length ? `I found ${items.length} saved product${items.length === 1 ? '' : 's'} relevant to your question.` : occasion ? `I couldn't find saved products for ${occasion}.` : 'Your wishlist is empty.';
  return { headline, sections, caveats: ['Wishlist and size charts are sample data; product platforms are not connected.', ...(events.length ? [] : ['No matching upcoming calendar event was found in the requested window.'])] };
}

async function appliances(run) {
  const today = isoDate(now());
  const q = run.question.toLowerCase();
  if (!run.hub.isAvailable('appliances')) {
    return { headline: "Appliances & Bills is switched off, so I can't check your bills or deadlines.", sections: [], caveats: ['Switch Appliances & Bills back on in the left panel.'] };
  }
  const soon = /soon|upcoming|renew|expir|this month/.test(q);
  const match = q.match(/next (\d+) days/);
  const withinDays = match ? Math.min(Number(match[1]), 730) : soon ? 30 : 365;
  const result = await run.read('appliances', 'get_upcoming_deadlines', { withinDays });
  if (!result.ok) return { headline: "I couldn't read your appliance deadlines.", sections: [], caveats: [result.error] };
  const names = await run.read('appliances', 'search_appliances', {});
  const byId = new Map((names.raw?.appliances ?? []).map((a) => [a.id, a]));
  const type = /warrant/.test(q) ? 'warranty_expiry'
    : /amc/.test(q) ? 'amc_renewal'
    : /emi|payment| instalment|installment/.test(q) ? 'emi_payment'
    : /return|replac/.test(q) ? 'return_window'
    : /servic/.test(q) ? 'service'
    : null;
  const keyword = (q.match(/washing machine|refrigerator|\bac\b|tv|laptop|cooler/) ?? [])[0]?.replace(/\bac\b/i, 'ac');
  let deadlines = result.raw?.deadlines ?? [];
  if (type) deadlines = deadlines.filter((d) => d.type === type);
  if (keyword) deadlines = deadlines.filter((d) => String(byId.get(d.applianceId)?.name ?? '').toLowerCase().includes(keyword.toLowerCase()));
  if (/this month/.test(q)) deadlines = deadlines.filter((d) => d.dueDate.slice(0, 7) === today.slice(0, 7));

  const items = deadlines.slice(0, 12).map((d) => {
    const appliance = byId.get(d.applianceId);
    const subject = appliance?.name ?? 'An appliance';
    const money = d.amount === null || d.amount === undefined ? '' : ` Amount: ${d.currency ?? 'INR'} ${d.amount}.`;
    return {
      text: `${subject}: ${d.title} on ${d.dueDate}.${money}`,
      detail: d.sourceDocumentId ? 'From a confirmed document.' : 'Confirmed manually.',
      source_ids: [`appliances:${d.id}`, ...(appliance ? [`appliances:${appliance.id}`] : [])],
    };
  });
  const sections = items.length ? [{ title: 'Confirmed appliance deadlines', items }] : [];
  const headline = items.length
    ? `${plural(items.length, 'confirmed deadline')} match${items.length === 1 ? 'es' : ''} your question.`
    : 'No confirmed appliance deadline matched that question.';
  return {
    headline,
    sections,
    caveats: ['Only deadlines you confirmed are included; unconfirmed fields from documents are never used.', ...(items.length ? [] : ['Check the Appliances dashboard or confirm the relevant document first.'])],
  };
}

async function followUpsAndWorkout(run) {
  const T = now();
  const today = isoDate(T);
  const has = (id) => run.hub.isAvailable(id);
  const caveats = [];

  let events = [];
  if (has('calendar')) {
    const r = await run.read('calendar', 'list_events', { date: today });
    if (r.ok) events = r.raw.events;
  } else caveats.push("Calendar is switched off, so I couldn't check your day.");

  const items = [];
  if (has('notes')) {
    const recent = await run.read('notes', 'list_recent_notes', { days: 3, tag: 'meeting' });
    for (const n of (recent.raw?.notes ?? []).slice(0, 2)) {
      const note = (await run.read('notes', 'get_note', { id: n.id })).raw?.note;
      for (const it of note?.action_items ?? []) if (it.owner === 'me' && !it.done) items.push({ ...it, note });
    }
  } else caveats.push("Notes is switched off, so I couldn't read your meeting notes or workout plan.");

  let openTasks = null;
  if (has('tasks')) {
    const r = await run.read('tasks', 'list_tasks', { status: 'open' });
    if (r.ok) openTasks = r.raw.tasks;
  } else caveats.push("Tasks is switched off, so I couldn't check what's already on your list.");

  // Follow-ups: my open action items from recent meetings, then tasks due today.
  const followUps = [];
  for (const it of items) {
    const title = it.text.replace(/\s*\(by [^)]*\)\s*$/i, '').trim();
    const noteId = `notes:${it.note.id}`;
    const match = openTasks?.find((t) => overlap(t.title, title) >= 0.75);
    if (match) {
      followUps.push({ text: `${capitalise(title)}.`, detail: `Already in your tasks, due ${fmtRelative(match.due, T)}.`, source_ids: [noteId, `tasks:${match.id}`] });
    } else {
      const drafted = Boolean(openTasks);
      followUps.push({
        text: `${capitalise(title)}.`,
        detail: drafted ? `From “${it.note.title}”. It isn't on your task list, so I've drafted a task for you to approve.` : `From “${it.note.title}”.`,
        source_ids: [noteId],
      });
      if (drafted) {
        run.propose('tasks', 'create_task', { title, due: dueFromText(it.text, T) ?? today, list: 'Work' }, {
          why: `It's your action item from “${it.note.title}” and isn't on your task list yet.`,
          sourceIds: [noteId],
        });
      }
    }
  }
  for (const t of (openTasks ?? []).filter((t) => t.due === today)) {
    if (followUps.some((f) => f.source_ids.includes(`tasks:${t.id}`))) continue;
    followUps.push({ text: `${t.title}.`, detail: `Due today, on your ${t.list} list.`, source_ids: [`tasks:${t.id}`] });
  }

  // Workout: the plan note says which days, how long and when; the calendar says what's free.
  let workout = null;
  let slotLabel = null;
  let runMinutes = null;
  if (has('notes')) {
    const found = await run.read('notes', 'search_notes', { query: 'workout plan', limit: 3 });
    const hit = found.raw?.notes?.[0];
    const plan = hit ? (await run.read('notes', 'get_note', { id: hit.id })).raw?.note : null;
    const p = plan ? parsePlan(plan.body) : null;
    const planId = plan ? `notes:${plan.id}` : null;
    const booked = events.find((e) => /\b(run|workout|gym)\b/i.test(e.title));
    if (p && !p.days.includes(shortWeekday(T))) {
      workout = { text: 'No run is planned for today.', detail: `Your plan has runs on ${p.days.join(', ')}.`, source_ids: [planId] };
    } else if (booked) {
      workout = { text: `Already on your calendar: “${booked.title}”, ${fmtRange(booked.start, booked.end)}.`, detail: 'Nothing to add.', source_ids: [planId, `calendar:${booked.id}`].filter(Boolean) };
    } else if (p && has('calendar')) {
      const r = await run.read('calendar', 'find_free_slots', { date: today, duration_minutes: p.minutes, not_before: p.window[0], not_after: p.window[1], buffer_minutes: p.buffer });
      const slot = r.raw?.slots?.[0];
      if (slot) {
        const start = slot.start;
        const end = fromMinutes(toMinutes(start) + p.minutes);
        const before = [...events].reverse().find((e) => toMinutes(e.end) <= toMinutes(start));
        const after = events.find((e) => toMinutes(e.start) >= toMinutes(end));
        const around = [before, after].filter(Boolean);
        const between = before && after
          ? `You're free between “${before.title}” (ends ${fmtTime(before.end)}) and “${after.title}” (${fmtTime(after.start)}).`
          : '';
        slotLabel = fmtTime(start);
        runMinutes = p.minutes;
        workout = {
          text: `${p.minutes}-minute easy run, ${fmtRange(start, end)}.`,
          detail: `Your plan has a run today, ideally ${fmtRange(...p.window)} with ${p.buffer} minutes free either side. ${between}`.trim(),
          source_ids: [planId, ...around.map((e) => `calendar:${e.id}`)],
        };
        run.propose('calendar', 'create_event', { title: 'Easy run', date: today, start, end, notes: `${p.minutes} min, easy pace (from your workout plan)` }, {
          why: `It's a run day in your plan, and this keeps ${p.buffer} minutes free around your other plans.`,
          sourceIds: [planId, ...around.map((e) => `calendar:${e.id}`)],
        });
      } else {
        workout = { text: 'No free slot fits your run today.', detail: `Your plan wants ${p.minutes} minutes between ${fmtRange(...p.window)}, and that window is booked.`, source_ids: [planId] };
      }
    }
  }

  const sections = [];
  if (followUps.length) sections.push({ title: 'Follow up today', items: followUps });
  if (workout) sections.push({ title: 'Workout', items: [workout] });
  const parts = [];
  if (followUps.length) parts.push(`${count(followUps.length)} follow-up${followUps.length === 1 ? '' : 's'} today`);
  if (slotLabel) parts.push(`a ${runMinutes}-minute run fits at ${slotLabel}`);
  const headline = parts.length ? `${capitalise(parts.join(', and '))}.` : 'Nothing needs following up today.';
  return { headline, sections, caveats };
}

async function spending(run) {
  const T = now();
  const { start, end } = lastWeek(T);
  const from = isoDate(start);
  const to = isoDate(end);
  if (!run.hub.isAvailable('money')) {
    return { headline: "Money is switched off, so I can't see your spending.", sections: [], caveats: ['Switch Money back on in the left panel to answer this.'] };
  }
  const sum = await run.read('money', 'summarize_spending', { start_date: from, end_date: to, categories: ['food'] });
  if (!sum.ok) return { headline: "I couldn't read your spending.", sections: [], caveats: [sum.error] };
  const data = sum.raw;
  const tx = (await run.read('money', 'list_transactions', { start_date: from, end_date: to, categories: ['food'] })).raw?.transactions ?? [];
  const summaryId = `money:${data.summary.id}`;

  const days = [...data.by_day].sort((a, b) => b.total - a.total).slice(0, 3);
  const dayItems = [];
  for (const d of days) {
    const spent = tx.filter((t) => t.date === d.date);
    let events = [];
    if (run.hub.isAvailable('calendar')) events = (await run.read('calendar', 'list_events', { date: d.date })).raw?.events ?? [];
    dayItems.push({
      text: `${fmtDay(d.date)}: ${fmtMoney(d.total)} at ${[...new Set(spent.map((t) => t.merchant))].join(' and ')}.`,
      detail: events.length ? `On your calendar that day: ${events.map((e) => `“${e.title}”`).join(', ')}.` : 'Nothing on your calendar that day.',
      source_ids: [...spent.map((t) => `money:${t.id}`), ...events.map((e) => `calendar:${e.id}`)],
    });
  }
  const categories = data.by_category.map((c) => ({ text: `${c.category}: ${fmtMoney(c.total)}`, detail: plural(c.count, 'purchase'), source_ids: [summaryId] }));

  const caveats = ['Calendar entries show what was happening on those days, not why you spent.'];
  caveats.push(data.source.type === 'sample data' ? 'Amounts come from a sample statement, not a real account.' : `Amounts come from ${data.source.name}.`);
  return {
    headline: `You spent ${fmtMoney(data.summary.total)} on food last week (${fmtDay(from)} – ${fmtDay(to)}), across ${plural(data.summary.count, 'purchase')}.`,
    sections: [
      { title: 'Biggest days', items: dayItems },
      { title: 'By category', items: categories },
    ],
    caveats,
  };
}
