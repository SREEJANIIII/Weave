// Plain-language copy for the services Weave can connect to. The list of services itself always
// comes from the server (/api/status); this file only says, in everyday words, what each one is.

export const SERVICE_COPY = {
  calendar: {
    name: 'Calendar',
    icon: 'i-calendar',
    sees: 'Your events: when they are, where, and who’s invited.',
    changes: 'Adds an event only after you say yes.',
    helps: 'Meetings, plans and free time',
  },
  notes: {
    name: 'Notes',
    icon: 'i-notes',
    sees: 'Your notes, including meeting notes and plans.',
    changes: 'Changes a note only after you say yes.',
    helps: 'What was decided and what you planned',
  },
  tasks: {
    name: 'To-dos',
    icon: 'i-tasks',
    sees: 'Your to-dos and when they’re due.',
    changes: 'Adds a to-do only after you say yes.',
    helps: 'What needs doing, and when',
  },
  money: {
    name: 'Money',
    icon: 'i-money',
    sees: 'Purchases in the statement you imported: the date, the shop and the amount. It never connects to your bank.',
    changes: 'Changes things only after you say yes.',
    helps: 'Spending and purchases',
  },
  wishlist: {
    name: 'Wishlist',
    icon: 'i-heart',
    sees: 'Products you’ve saved, and size suggestions. Your measurements are only used for size questions.',
    changes: 'Saves or changes wishlist items only after you say yes.',
    helps: 'Saved outfits and sizes',
  },
  appliances: {
    name: 'Appliances & Bills',
    icon: 'i-receipt',
    sees: 'Bills, warranties and service records you upload and confirm.',
    changes: 'Saves appliance details and deadlines only after you confirm them.',
    helps: 'Warranty dates, service records and bill deadlines',
  },
};

/** Colour thread for a service; matches the yarns on the landing page. */
export const YARN_VAR = {
  calendar: 'var(--yarn-calendar)',
  notes: 'var(--yarn-notes)',
  tasks: 'var(--yarn-tasks)',
  money: 'var(--yarn-workout)',
  wishlist: 'var(--yarn-wishlist)',
  appliances: 'var(--yarn-wishlist)',
  saved: 'var(--color-edge)',
};

export const serviceName = (id, fallback) => SERVICE_COPY[id]?.name ?? fallback ?? id;

export function joinNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const STEP_COPY = {
  list_events: 'Looking at your calendar',
  get_event: 'Looking at your calendar',
  find_free_slots: 'Finding free time in your calendar',
  list_recent_notes: 'Reading your recent notes',
  search_notes: 'Searching your notes',
  get_note: 'Reading a note',
  list_tasks: 'Checking your to-dos',
  get_task: 'Checking your to-dos',
  summarize_spending: 'Adding up your spending',
  list_transactions: 'Looking through your purchases',
  list_wishlist_items: 'Looking at your wishlist',
  search_wishlist: 'Searching your wishlist',
  match_product_size: 'Comparing sizes with your measurements',
};

/** What the assistant is doing right now, in words a person would use. */
export function stepText(step) {
  if (!step) return 'Thinking about where to look';
  if (step.kind === 'write') return 'Getting a change ready for you to approve';
  return STEP_COPY[step.tool] ?? `Checking your ${serviceName(step.server, step.app)}`;
}

/** Services the dashboard can show: what the server reports, merged with plain copy and the person's consent. */
export function describeServices(status, consent) {
  return (status?.apps ?? []).map((a) => {
    const copy = SERVICE_COPY[a.id] ?? { name: a.name, icon: 'i-plug', sees: a.blurb, changes: 'Changes things only after you say yes.', helps: a.blurb };
    const canChange = a.tools.some((t) => !t.readOnly);
    const reachable = a.status === 'connected';
    const granted = consent[a.id] === 'granted';
    return {
      id: a.id,
      name: copy.name,
      icon: copy.icon,
      sees: copy.sees,
      changes: canChange ? copy.changes : 'Can’t change anything.',
      helps: copy.helps,
      tools: a.tools,
      // 'connected': allowed and working · 'off': not allowed (yet) · 'unavailable': allowed or not, but unreachable
      state: !reachable ? 'unavailable' : granted && a.enabled ? 'connected' : 'off',
      notSetUp: a.status === 'not_set_up',
      granted,
      error: a.error,
    };
  });
}
