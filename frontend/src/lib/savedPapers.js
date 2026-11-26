// Saved papers: receipts, warranties, bills, events and notes a person adds from a photo or file.
// They live in this browser only. This file holds their shape, the sample set, and the small
// question-matcher that answers "When did I buy my fridge?" from them.

export const KINDS = {
  receipt: { label: 'Receipt', icon: 'i-receipt', fields: ['item', 'merchant', 'date', 'amount', 'warranty_until', 'reference', 'notes'] },
  warranty: { label: 'Warranty', icon: 'i-shield', fields: ['item', 'merchant', 'date', 'warranty_until', 'reference', 'notes'] },
  bill: { label: 'Bill', icon: 'i-file', fields: ['merchant', 'amount', 'due_date', 'date', 'reference', 'notes'] },
  event: { label: 'Event', icon: 'i-calendar', fields: ['item', 'date', 'time', 'place', 'notes'] },
  workout: { label: 'Workout', icon: 'i-fitness', fields: ['item', 'date', 'notes'] },
  other: { label: 'Other', icon: 'i-file', fields: ['item', 'date', 'notes'] },
};

export const FIELD_LABELS = {
  receipt: { item: 'What you bought', merchant: 'Shop', date: 'Bought on', amount: 'Amount paid', warranty_until: 'Warranty until', reference: 'Invoice number', notes: 'Notes' },
  warranty: { item: 'Product', merchant: 'Brand or seller', date: 'Bought on', warranty_until: 'Covered until', reference: 'Warranty or serial number', notes: 'Notes' },
  bill: { merchant: 'Who it’s from', amount: 'Amount due', due_date: 'Due on', date: 'Bill date', reference: 'Account number', notes: 'Notes' },
  event: { item: 'What it is', date: 'Date', time: 'Time', place: 'Where', notes: 'Notes' },
  workout: { item: 'Activity', date: 'Date', notes: 'What you did' },
  other: { item: 'What it is', date: 'Date', notes: 'Notes' },
};

export const FIELD_TYPES = { date: 'date', warranty_until: 'date', due_date: 'date', time: 'time' };

export const EMPTY_FIELDS = { item: '', merchant: '', date: '', amount: '', currency: 'INR', warranty_until: '', due_date: '', time: '', place: '', reference: '', notes: '' };

/* ---------- Dates and money ---------- */

const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const isValidIso = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') && !Number.isNaN(parseIso(iso).getTime());

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 14 Mar 2025"; the year is left off for this year. */
export function fmtDate(iso, { weekday = true } = {}) {
  if (!isValidIso(iso)) return '';
  const d = parseIso(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${weekday ? `${WEEKDAYS[d.getDay()]} ` : ''}${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

export function daysFromToday(iso) {
  return Math.round((startOfDay(parseIso(iso)) - startOfDay(new Date())) / 86400000);
}

/** "in 6 weeks", "tomorrow", "3 days ago" */
export function fmtRelative(iso) {
  const n = daysFromToday(iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  const abs = Math.abs(n);
  const span = abs >= 60 ? `${Math.round(abs / 30)} months` : abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} days`;
  return n > 0 ? `in ${span}` : `${span} ago`;
}

export function fmtMoney(amount, currency = 'INR') {
  const n = Number(String(amount ?? '').replace(/[^0-9.]/g, ''));
  if (!amount || Number.isNaN(n)) return '';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

/** One line that says what matters about a saved paper. */
export function summarize(item) {
  const f = item.fields ?? {};
  const money = fmtMoney(f.amount, f.currency);
  switch (item.kind) {
    case 'receipt':
      return [f.date && `Bought ${fmtDate(f.date)}`, money, f.merchant].filter(Boolean).join(' · ');
    case 'warranty':
      if (isValidIso(f.warranty_until)) {
        return daysFromToday(f.warranty_until) >= 0 ? `Covered until ${fmtDate(f.warranty_until)}` : `Warranty ended ${fmtDate(f.warranty_until)}`;
      }
      return [f.merchant, f.date && `Bought ${fmtDate(f.date)}`].filter(Boolean).join(' · ');
    case 'bill':
      return [money, f.due_date && `Due ${fmtDate(f.due_date)}`].filter(Boolean).join(' · ');
    case 'event':
      return [fmtDate(f.date), f.time, f.place].filter(Boolean).join(' · ');
    default:
      return [fmtDate(f.date), f.item].filter(Boolean).join(' · ');
  }
}

/** "Fridge receipt" -> "fridge"; used in sentences like "You bought your fridge…". */
export function nounFor(item) {
  const fromTitle = (item.title ?? '').replace(/\b(receipt|warranty|bill|invoice|card|certificate|notes?)\b/gi, '').trim().toLowerCase();
  return fromTitle || (item.fields?.item ?? '').toLowerCase() || KINDS[item.kind]?.label.toLowerCase() || 'item';
}

/* ---------- Sample papers (clearly marked as samples in the interface) ---------- */

function lastWeekTuesday(today) {
  const sinceMonday = (today.getDay() + 6) % 7;
  return addDays(today, -sinceMonday - 7 + 1);
}

export function createSampleSaved(today = new Date()) {
  const fridgeBought = new Date(today.getFullYear(), today.getMonth() - 20, 14);
  const washerUntil = addDays(today, 41);
  const washerBought = new Date(washerUntil.getFullYear() - 2, washerUntil.getMonth(), washerUntil.getDate());
  const gymDay = lastWeekTuesday(today);
  return [
    {
      id: 'sample-fridge-receipt',
      kind: 'receipt',
      title: 'Fridge receipt',
      fields: {
        ...EMPTY_FIELDS,
        item: 'Frostline 260 L double-door fridge',
        merchant: 'Homestead Appliances, Indiranagar',
        date: isoOf(fridgeBought),
        amount: '28490',
        warranty_until: isoOf(new Date(fridgeBought.getFullYear() + 1, fridgeBought.getMonth(), fridgeBought.getDate())),
        reference: 'HA-24117',
        notes: 'Compressor has its own 10-year warranty.',
      },
      image: 'sample:fridge-receipt',
      source: 'sample',
      sample: true,
      savedAt: addDays(today, -3).toISOString(),
    },
    {
      id: 'sample-washer-warranty',
      kind: 'warranty',
      title: 'Washing machine warranty',
      fields: {
        ...EMPTY_FIELDS,
        item: 'Aquara 7 kg front-load washing machine',
        merchant: 'Aquara',
        date: isoOf(washerBought),
        warranty_until: isoOf(washerUntil),
        reference: 'AQW7-58213-K',
        notes: 'One free service visit is included before the warranty ends.',
      },
      image: 'sample:washer-warranty',
      source: 'sample',
      sample: true,
      savedAt: addDays(today, -12).toISOString(),
    },
    {
      id: 'sample-gym-note',
      kind: 'workout',
      title: 'Gym notes',
      fields: {
        ...EMPTY_FIELDS,
        item: 'Strength session',
        date: isoOf(gymDay),
        notes: 'Squats 3 × 8 at 50 kg, rows 3 × 10, plank 3 × 45 s. Felt strong; add 2.5 kg next time.',
      },
      image: null,
      source: 'sample',
      sample: true,
      savedAt: gymDay.toISOString(),
    },
  ];
}

/* ---------- Sample images, drawn as paper ---------- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const rupees = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;

function receiptSvg({ shop, address, date, lines, total, footer, invoice }) {
  const rows = lines
    .map((l, i) => `<text x="22" y="${178 + i * 22}">${esc(l[0])}</text><text x="278" y="${178 + i * 22}" text-anchor="end">${esc(l[1])}</text>`)
    .join('');
  const y = 178 + lines.length * 22;
  const zig = Array.from({ length: 21 }, (_, i) => `${i * 15},${i % 2 ? 452 : 460}`).join(' ');
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 470" width="300" height="470">
<rect width="300" height="470" fill="#efece6"/>
<polygon points="0,0 300,0 300,452 ${zig}" fill="#fffdf8"/>
<g font-family="ui-monospace, Menlo, monospace" font-size="12" fill="#2a2826">
<text x="150" y="44" text-anchor="middle" font-size="16" font-weight="700" letter-spacing="1">${esc(shop.toUpperCase())}</text>
<text x="150" y="64" text-anchor="middle" fill="#6b6762">${esc(address)}</text>
<text x="22" y="104">Invoice ${esc(invoice)}</text><text x="278" y="104" text-anchor="end">${esc(date)}</text>
<line x1="22" y1="124" x2="278" y2="124" stroke="#2a2826" stroke-dasharray="3 3"/>
<text x="22" y="150" fill="#6b6762">ITEM</text><text x="278" y="150" text-anchor="end" fill="#6b6762">AMOUNT</text>
${rows}
<line x1="22" y1="${y + 4}" x2="278" y2="${y + 4}" stroke="#2a2826" stroke-dasharray="3 3"/>
<text x="22" y="${y + 30}" font-size="14" font-weight="700">TOTAL</text><text x="278" y="${y + 30}" text-anchor="end" font-size="14" font-weight="700">${esc(total)}</text>
${footer.map((f, i) => `<text x="150" y="${y + 72 + i * 18}" text-anchor="middle" fill="#6b6762">${esc(f)}</text>`).join('')}
</g></svg>`);
}

function warrantySvg({ brand, product, serial, bought, until }) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 270" width="420" height="270">
<rect width="420" height="270" fill="#e7ece9"/>
<rect x="12" y="12" width="396" height="246" rx="10" fill="#fbfcfb" stroke="#2f6a57" stroke-width="2"/>
<rect x="24" y="24" width="372" height="222" rx="6" fill="none" stroke="#2f6a57" stroke-width="0.8" stroke-dasharray="2 3"/>
<g font-family="ui-sans-serif, system-ui, sans-serif" fill="#1f2a26">
<text x="44" y="66" font-size="22" font-weight="800" letter-spacing="3" fill="#2f6a57">${esc(brand.toUpperCase())}</text>
<text x="44" y="88" font-size="12" letter-spacing="2" fill="#5d6b66">WARRANTY CERTIFICATE</text>
<text x="44" y="126" font-size="11" fill="#5d6b66">Product</text><text x="44" y="144" font-size="14" font-weight="600">${esc(product)}</text>
<text x="44" y="174" font-size="11" fill="#5d6b66">Serial no.</text><text x="44" y="192" font-size="13" font-family="ui-monospace, Menlo, monospace">${esc(serial)}</text>
<text x="220" y="174" font-size="11" fill="#5d6b66">Purchased</text><text x="220" y="192" font-size="13">${esc(bought)}</text>
<text x="44" y="222" font-size="11" fill="#5d6b66">Covered until</text><text x="132" y="222" font-size="13" font-weight="700">${esc(until)}</text>
</g>
<circle cx="350" cy="80" r="34" fill="none" stroke="#2f6a57" stroke-width="2"/><circle cx="350" cy="80" r="27" fill="none" stroke="#2f6a57" stroke-width="0.8"/>
<text x="350" y="77" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="9" font-weight="700" fill="#2f6a57" letter-spacing="1">2 YEAR</text>
<text x="350" y="90" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="9" font-weight="700" fill="#2f6a57" letter-spacing="1">COVER</text>
</svg>`);
}

const slash = (iso) => (isValidIso(iso) ? iso.split('-').reverse().join('/') : '');

/** Images for the sample papers are drawn on demand rather than stored. */
export function imageFor(item) {
  if (!item?.image) return null;
  if (!String(item.image).startsWith('sample:')) return item.image;
  const f = item.fields;
  if (item.image === 'sample:fridge-receipt') {
    return receiptSvg({
      shop: 'Homestead Appliances', address: '12th Main, Indiranagar', invoice: f.reference, date: slash(f.date),
      lines: [['Frostline 260 L fridge', rupees(27990)], ['Installation', rupees(500)]], total: rupees(28490),
      footer: ['Warranty: 1 year from purchase', 'Compressor: 10 years', 'Thank you for shopping with us'],
    });
  }
  if (item.image === 'sample:washer-warranty') {
    return warrantySvg({ brand: 'Aquara', product: '7 kg front-load washing machine', serial: f.reference, bought: slash(f.date), until: slash(f.warranty_until) });
  }
  if (item.image === 'sample:headphones-receipt') {
    return receiptSvg({
      shop: 'Soundbox Store', address: 'Phoenix Mall, Whitefield', invoice: f.reference || 'SB-90412', date: slash(f.date),
      lines: [['Sonora WH-40 headphones', rupees(6999)]], total: rupees(6999),
      footer: ['1 year warranty on manufacturing defects', 'Keep this receipt for returns'],
    });
  }
  return null;
}

/** "Try a sample receipt": a sample photo and the details a reader would return for it. */
export function sampleUpload(today = new Date()) {
  const date = isoOf(addDays(today, -1));
  const until = isoOf(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate() - 1));
  return {
    fileName: 'Sample receipt',
    image: 'sample:headphones-receipt',
    preview: imageFor({ image: 'sample:headphones-receipt', fields: { reference: 'SB-90412', date } }),
    kind: 'receipt',
    title: 'Headphones receipt',
    fields: { ...EMPTY_FIELDS, item: 'Sonora WH-40 headphnes', merchant: 'Soundbox Store, Whitefield', date, amount: '6999', warranty_until: until, reference: 'SB-90412' },
    unsure: ['item'],
  };
}

/* ---------- Answering from saved papers ---------- */

const STOP = new Set('the and my me is are was were when did does do what which where how show find give tell about for of to on in at it its this that have has had any still get got bought buy purchase purchased paid saved save please can you could see open last week today yesterday next'.split(' '));
const DOC_RE = /\b(receipts?|warrant(y|ies)|guarantee|bills?|invoices?|bought|buy|purchased?|paid for|saved papers?|documents?)\b/i;
const terms = (q) => q.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

function haystack(item) {
  return [item.title, item.fields?.item, item.fields?.merchant, KINDS[item.kind]?.label].join(' ').toLowerCase();
}
function score(item, ts) {
  const hay = haystack(item);
  return ts.filter((t) => {
    const stem = t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t;
    return new RegExp(`\\b${stem}(s|es)?\\b`).test(hay);
  }).length;
}

/** Ranked saved papers that match the question's words. */
export function findSaved(question, saved) {
  const ts = terms(question);
  return saved
    .map((it) => ({ it, s: score(it, ts) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.it.savedAt ?? '').localeCompare(a.it.savedAt ?? ''))
    .map((x) => x.it);
}

/**
 * Decide whether a question is about saved papers. Workout and event notes never claim a question on
 * their own (those go to Calendar first and are added alongside); receipts, warranties and bills do.
 */
export function savedIntent(question, saved) {
  const q = question.toLowerCase();
  const matches = findSaved(question, saved);
  const papers = matches.filter((it) => ['receipt', 'warranty', 'bill', 'other'].includes(it.kind));
  const docWords = DOC_RE.test(q);
  return { claims: docWords || papers.length > 0, matches: docWords ? matches : papers, docWords };
}

const sourceFor = (item, n) => ({
  source_id: `saved:${item.id}`,
  server: 'saved',
  app: 'Saved on this device',
  n,
  record: { kind: 'document', id: item.id, title: item.title, meta: summarize(item), snippet: item.fields?.notes ?? '' },
});

function run(question, { headline, sections = [], caveats = [], items = [], unanswered = false }) {
  const sources = items.map((it, i) => sourceFor(it, i + 1));
  return {
    question,
    mode: 'local-saved',
    steps: [],
    proposals: [],
    done: true,
    savedItems: items.map((it) => it.id),
    showFirst: /\b(show|see|open|find|where)\b/i.test(question),
    unanswered,
    answer: { headline, sections, caveats, sources, proposals: [], stats: { reads: 0, ms: 0, mode: 'local-saved', apps: ['Saved on this device'] } },
  };
}

/** Build an answer from saved papers, or an honest "couldn't find it" when nothing matches. */
export function answerFromSaved(question, saved, { matches }) {
  const q = question.toLowerCase();
  const wantsWarranty = /warrant|guarantee|covered/.test(q);
  const wantsWhen = /when did|bought|buy|purchase|how much/.test(q);
  const kindAsked = /receipt/.test(q) ? 'receipt' : /warrant/.test(q) ? 'warranty' : /\bbills?\b/.test(q) ? 'bill' : null;
  const subject = terms(question).filter((t) => !/^(receipts?|warrant(y|ies)|bills?|invoices?|documents?|papers?|all|list|still|under)$/.test(t)).join(' ');

  if (kindAsked && !subject) {
    const ofKind = saved.filter((it) => it.kind === kindAsked || (kindAsked === 'warranty' && isValidIso(it.fields?.warranty_until)));
    if (ofKind.length) {
      return run(question, {
        headline: `You have ${ofKind.length} saved ${KINDS[kindAsked].label.toLowerCase()}${ofKind.length === 1 ? '' : 's'}.`,
        sections: [{ title: 'Saved on this device', items: ofKind.map((it) => ({ text: it.title, detail: summarize(it), sourceIds: [`saved:${it.id}`] })) }],
        items: ofKind,
      });
    }
  }
  if (!matches.length) {
    return run(question, {
      headline: subject ? `I couldn’t find anything about “${subject}” in your saved papers.` : 'I couldn’t find that in your saved papers.',
      caveats: ['Weave only knows about receipts and warranties you’ve added. Add a photo of it and you can ask again.'],
      unanswered: true,
    });
  }

  const item = matches[0];
  const f = item.fields;
  const noun = nounFor(item);
  const id = `saved:${item.id}`;
  const facts = [];
  if (f.date) facts.push({ text: `${item.kind === 'receipt' || item.kind === 'warranty' ? 'Bought' : 'Dated'} ${fmtDate(f.date)}`, detail: [f.merchant, fmtMoney(f.amount, f.currency)].filter(Boolean).join(' · '), sourceIds: [id] });
  if (isValidIso(f.warranty_until)) {
    const left = daysFromToday(f.warranty_until);
    facts.push({ text: left >= 0 ? `Covered until ${fmtDate(f.warranty_until)}` : `Warranty ended ${fmtDate(f.warranty_until)}`, detail: left >= 0 ? `That’s ${fmtRelative(f.warranty_until)}.` : '', sourceIds: [id] });
  }
  if (f.reference) facts.push({ text: `Reference ${f.reference}`, detail: '', sourceIds: [id] });
  if (f.notes) facts.push({ text: f.notes, detail: '', sourceIds: [id] });

  let headline;
  if (wantsWarranty) {
    if (isValidIso(f.warranty_until)) {
      headline = daysFromToday(f.warranty_until) >= 0
        ? `Your ${noun} is covered until ${fmtDate(f.warranty_until)}, ${fmtRelative(f.warranty_until)}.`
        : `Your ${noun}’s warranty ended on ${fmtDate(f.warranty_until)}.`;
    } else {
      headline = `I have your ${noun} ${KINDS[item.kind].label.toLowerCase()}, but it doesn’t show when the warranty ends.`;
    }
  } else if (wantsWhen && f.date) {
    const money = fmtMoney(f.amount, f.currency);
    headline = `You bought your ${noun} on ${fmtDate(f.date)}${f.merchant ? ` at ${f.merchant.split(',')[0]}` : ''}${money ? ` for ${money}` : ''}.`;
  } else {
    headline = `Here’s your ${noun} ${KINDS[item.kind].label.toLowerCase()}.`;
  }

  return run(question, {
    headline,
    sections: [{ title: item.title, items: facts }],
    caveats: item.sample ? ['This is a sample paper that comes with the prototype.'] : [],
    items: [item],
  });
}

/** Workout notes from last week, added beside a Calendar answer to "What did I do at the gym last week?". */
export function workoutNotesForLastWeek(question, saved, today = new Date()) {
  const q = question.toLowerCase();
  if (!/gym|workout|exercise|training|strength/.test(q) || !/last week/.test(q)) return [];
  const sinceMonday = (today.getDay() + 6) % 7;
  const start = isoOf(addDays(today, -sinceMonday - 7));
  const end = isoOf(addDays(today, -sinceMonday - 1));
  return saved.filter((it) => it.kind === 'workout' && it.fields?.date >= start && it.fields?.date <= end);
}

/** Add saved workout notes to an answer that came from connected services. */
export function withSavedNotes(answer, notes) {
  if (!notes.length) return answer;
  const nextN = Math.max(0, ...answer.sources.map((s) => s.n ?? 0)) + 1;
  const sources = [...answer.sources, ...notes.map((it, i) => sourceFor(it, nextN + i))];
  const section = {
    title: 'From your saved notes',
    items: notes.map((it) => ({ text: `${fmtDate(it.fields.date)}: ${it.fields.item || it.title}`, detail: it.fields.notes, sourceIds: [`saved:${it.id}`] })),
  };
  return { ...answer, sections: [...answer.sections, section], sources };
}

/** Reminder for the Today panel: a warranty ending or a bill falling due soon. */
export function savedReminder(saved) {
  const soon = saved
    .flatMap((it) => {
      const out = [];
      if (isValidIso(it.fields?.warranty_until)) {
        const d = daysFromToday(it.fields.warranty_until);
        if (d >= 0 && d <= 90) out.push({ item: it, days: d, text: `${it.title.replace(/\s*(receipt|warranty)$/i, '')} warranty ends ${fmtRelative(it.fields.warranty_until)}`, when: fmtDate(it.fields.warranty_until) });
      }
      if (it.kind === 'bill' && isValidIso(it.fields?.due_date)) {
        const d = daysFromToday(it.fields.due_date);
        if (d >= 0 && d <= 14) out.push({ item: it, days: d, text: `${it.title} is due ${fmtRelative(it.fields.due_date)}`, when: fmtDate(it.fields.due_date) });
      }
      return out;
    })
    .sort((a, b) => a.days - b.days);
  return soon[0] ?? null;
}
