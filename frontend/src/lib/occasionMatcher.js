const SYNONYMS = {
  diwali: ['diwali', 'deepavali', 'festival', 'festive'],
  wedding: ['wedding', 'sangeet', 'reception', 'mehendi', 'shaadi'],
  birthday: ['birthday', 'bday', 'dinner'],
  party: ['party', 'mixer', 'cocktail', 'evening'],
  vacation: ['vacation', 'trip', 'holiday', 'weekend', 'travel', 'goa'],
  festival: ['festival', 'festive', 'diwali', 'puja', 'eid', 'navratri'],
  casual: ['casual', 'everyday', 'brunch'],
};

function expandTerms(text) {
  const norm = (text || '').toLowerCase().trim();
  if (!norm) return [];
  const base = norm.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const out = new Set([norm, ...base]);
  for (const w of base) {
    for (const group of Object.values(SYNONYMS)) {
      if (group.includes(w)) group.forEach((g) => out.add(g));
    }
  }
  return [...out];
}

export function daysUntil(isoDate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

export function activeLeadWindows(reminderPrefs) {
  const set = new Set(reminderPrefs?.leadDays ?? [30, 14, 7]);
  const custom = Number(reminderPrefs?.customDays);
  if (Number.isFinite(custom) && custom > 0) set.add(custom);
  return [...set].sort((a, b) => b - a);
}

/**
 * Matches upcoming calendar events with saved wishlist items and surfaces reminders
 * that fall inside the user's configured lead-day windows.
 */
export function matchOccasions(wishlistItems, calendarEvents, reminderPrefs) {
  const windows = activeLeadWindows(reminderPrefs);
  const maxWindow = windows.length ? Math.max(...windows) : 30;
  const dismissed = new Set(reminderPrefs?.dismissedIds ?? []);

  const matches = [];

  for (const event of calendarEvents) {
    const days = daysUntil(event.date);
    if (days < 0) continue;

    const eventTerms = new Set([...expandTerms(event.occasion), ...expandTerms(event.title)]);
    const items = wishlistItems.filter((item) => {
      const itemTerms = expandTerms(item.occasion);
      return itemTerms.some((t) => eventTerms.has(t));
    });

    if (!items.length) continue;

    // Smallest configured lead window >= days remaining (or within maxWindow)
    const eligibleWindows = windows.filter((w) => days <= w);
    const triggeredWindow = eligibleWindows.length ? Math.min(...eligibleWindows) : null;

    matches.push({
      id: `${event.id}:${items.map((i) => i.id).join(',')}`,
      event,
      daysUntil: days,
      items,
      triggeredWindow,
      inWindow: days <= maxWindow && windows.length > 0,
      dismissed: dismissed.has(event.id),
    });
  }

  matches.sort((a, b) => a.daysUntil - b.daysUntil);
  return matches;
}

export function getItemEventMatch(item, occasionMatches) {
  return occasionMatches.find((m) => m.items.some((it) => it.id === item.id)) ?? null;
}

