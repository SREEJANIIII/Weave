export const YARN = { calendar: 'calendar', notes: 'notes', tasks: 'tasks', money: 'money' };

export const ICON = {
  calendar: 'i-calendar',
  notes: 'i-notes',
  tasks: 'i-tasks',
  money: 'i-money',
  email: 'i-mail',
  fitness: 'i-fitness',
  travel: 'i-plug',
  learning: 'i-plug',
  home: 'i-plug',
};

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
    default:
      return { title: r.title ?? r.id, meta: '', snippet: '' };
  }
}

