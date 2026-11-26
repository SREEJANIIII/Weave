export const SHORT = {
  'What should I follow up on today, and when can I fit in a workout?': 'Follow-ups and a workout today',
  'How much did I spend on food last week, and what was happening on those days?': 'Food spending last week',
};

export const EDITABLE = {
  create_task: [
    ['title', 'text', 'Title'],
    ['due', 'date', 'Due'],
  ],
  create_event: [
    ['title', 'text', 'Title'],
    ['date', 'date', 'Date'],
    ['start', 'time', 'Start'],
    ['end', 'time', 'End'],
  ],
  save_wishlist_item: [
    ['product_name', 'text', 'Product name'],
    ['brand', 'text', 'Brand'],
    ['category', 'text', 'Category'],
    ['occasion', 'text', 'Occasion'],
    ['product_url', 'url', 'Product URL'],
    ['image_url', 'url', 'Image URL'],
    ['price', 'number', 'Price (INR)'],
    ['notes', 'text', 'Notes'],
  ],
  update_wishlist_item: [
    ['product_name', 'text', 'Product name'],
    ['brand', 'text', 'Brand'],
    ['category', 'text', 'Category'],
    ['occasion', 'text', 'Occasion'],
    ['status', 'text', 'Status (saved/purchased/archived)'],
    ['product_url', 'url', 'Product URL'],
    ['notes', 'text', 'Notes'],
  ],
  update_size_profile: [
    ['unit', 'text', 'Unit (cm/inches)'],
    ['preferred_fit', 'text', 'Fit (slim/regular/oversized)'],
    ['preferred_categories', 'text', 'Categories (comma-separated)'],
    ['bust', 'number', 'Bust'],
    ['waist', 'number', 'Waist'],
    ['hips', 'number', 'Hips'],
    ['shoulder', 'number', 'Shoulder'],
    ['inseam', 'number', 'Inseam'],
    ['height', 'number', 'Height'],
  ],
};

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const listJoin = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDate = (iso) => (iso ? dayFmt.format(new Date(`${iso}T00:00:00`)) : '');

export const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function fmtArgs(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${Array.isArray(v) ? v.join(', ') : String(v).slice(0, 48)}`)
    .join(', ');
}

export function describeRecord(r) {
  switch (r.kind) {
    case 'event':
      return {
        title: r.title,
        meta: [`${fmtDate(r.date)}, ${r.start} to ${r.end}`, r.location].filter(Boolean).join(', '),
        snippet: r.attendees?.length ? `With ${listJoin(r.attendees)}` : '',
      };
    case 'task':
      return {
        title: r.title,
        meta: [r.due ? `Due ${fmtDate(r.due)}` : 'No due date', r.list && `${r.list} list`, r.status === 'done' && 'done']
          .filter(Boolean)
          .join(', '),
        snippet: '',
      };
    case 'note':
      return {
        title: r.title,
        meta: r.updated ? `Updated ${fmtDate(r.updated)}` : '',
        snippet: r.snippet ?? '',
      };
    case 'transaction':
      return {
        title: r.merchant,
        meta: `${money.format(r.amount)}, ${fmtDate(r.date)}`,
        snippet: r.category ?? '',
      };
    case 'summary':
      return {
        title: r.title,
        meta: `${money.format(r.total)} across ${plural(r.count, 'purchase')}`,
        snippet: '',
      };
    case 'wishlist_item':
      return {
        title: r.product_name ?? r.title ?? r.id,
        meta: [r.brand, r.category, r.occasion, r.status].filter(Boolean).join(' · '),
        snippet: r.notes || r.description || '',
      };
    case 'size_profile':
      return {
        title: 'My Size Profile',
        meta: [r.preferred_fit && `${r.preferred_fit} fit`, r.unit && `Unit: ${r.unit}`].filter(Boolean).join(' · '),
        snippet: r.privacy ?? 'Private measurements (redacted from public activity logs).',
      };
    case 'reminder':
      return {
        title: `${r.occasion || 'Occasion'} reminder (${r.reminder_window ?? '?'}d window)`,
        meta: [r.event_date && fmtDate(r.event_date), r.status].filter(Boolean).join(' · '),
        snippet: '',
      };
    default:
      return { title: r.title ?? r.product_name ?? r.id, meta: '', snippet: '' };
  }
}
