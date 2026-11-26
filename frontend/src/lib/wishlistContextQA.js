import { lookupBrandChart } from '../data/wishlistSample.js';
import { matchOccasions } from './occasionMatcher.js';
import { recommendSize } from './sizeEngine.js';
import { formatMeasure } from './units.js';

const WISHLIST_INTENT_RE =
  /\b(wishlist|wish\s*list|outfit|outfits|saved|save for|diwali|wedding|birthday|party|vacation|festival|saree|dress|dresses|kurta|trousers|top|blouse|juttis|footwear|size|sizing|fit|fits|revisit|wear|brand\s*[ab])\b/i;

export function isWishlistQuery(question, wishlist = []) {
  const q = (question || '').trim();
  if (!q) return false;
  if (WISHLIST_INTENT_RE.test(q)) return true;
  const low = q.toLowerCase();
  return wishlist.some(
    (it) => low.includes(it.name.toLowerCase()) || low.includes(it.brand.toLowerCase()),
  );
}

function fmtShortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Evaluates natural-language questions against the user's frontend Wishlist, Size Profile,
 * Brand Size Charts, and Calendar Occasions, producing a Weave-compatible Run result.
 */
export function buildWishlistRunResponse({ question, wishlist, sizeProfile, occasions, reminderPrefs, onApproveReminder }) {
  const started = performance.now();
  const q = question.trim();
  const low = q.toLowerCase();

  const matches = matchOccasions(wishlist, occasions, reminderPrefs);
  const steps = [];
  const sources = [];
  let stepId = 1;
  let sourceCounter = 1;

  const addSource = (server, app, record) => {
    const source_id = `${server}:${record.id}`;
    const existing = sources.find((s) => s.source_id === source_id);
    if (existing) return existing;
    const entry = { source_id, server, app, record, n: sourceCounter++ };
    sources.push(entry);
    return entry;
  };

  steps.push({
    id: stepId++,
    server: 'wishlist',
    app: 'Wishlist',
    tool: 'list_wishlist_items',
    args: { sample: true },
    kind: 'read',
    status: 'done',
    summary: `${wishlist.length} saved items`,
    ms: 4,
  });

  // Detect specific occasion keyword
  const occasionTokens = ['diwali', 'wedding', 'birthday', 'party', 'vacation', 'casual', 'festival'];
  const askedOccasion = occasionTokens.find((tok) => low.includes(tok));
  const askedFitOrSize = /\b(fit|fits|size|sizing|wear|consider|chart|measurement)\b/i.test(low);
  const askedRevisit = /\b(revisit|upcoming|next month|before my|coming up|remind)\b/i.test(low);

  // Check if user named a specific product, brand, or category (e.g., "dress")
  const mentionedItems = wishlist.filter((item) => {
    const nameMatch = low.includes(item.name.toLowerCase()) || item.name.toLowerCase().split(/\s+/).some((w) => w.length > 4 && low.includes(w));
    const brandMatch = low.includes(item.brand.toLowerCase());
    const catMatch =
      (low.includes('dress') && item.category === 'Dresses') ||
      (low.includes('trouser') && item.category === 'Trousers') ||
      (low.includes('saree') && item.category === 'Ethnic') ||
      (low.includes('kurta') && item.category === 'Ethnic') ||
      ((low.includes('top') || low.includes('blouse')) && item.category === 'Tops') ||
      ((low.includes('shoe') || low.includes('jutti') || low.includes('footwear')) && item.category === 'Footwear');
    return nameMatch || brandMatch || catMatch;
  });

  // Always read Calendar when occasion/revisit/upcoming is relevant
  if (askedOccasion || askedRevisit || !askedFitOrSize) {
    steps.push({
      id: stepId++,
      server: 'calendar',
      app: 'Calendar',
      tool: 'list_upcoming_occasions',
      args: askedOccasion ? { tag: askedOccasion } : {},
      kind: 'read',
      status: 'done',
      summary: `${occasions.length} occasions`,
      ms: 3,
    });
  }

  // Read Size Profile & Brand Charts when fit/size or specific product is evaluated
  steps.push({
    id: stepId++,
    server: 'wishlist',
    app: 'Size Profile',
    tool: 'get_size_profile',
    args: { unit: sizeProfile.unit },
    kind: 'read',
    status: 'done',
    summary: `${formatMeasure(sizeProfile.bust, sizeProfile.unit, sizeProfile.masked)} bust, ${sizeProfile.fit} fit`,
    ms: 2,
  });

  const profileSource = addSource('wishlist', 'Size Profile', {
    id: 'size_profile',
    kind: 'note',
    title: `My Size Profile (${sizeProfile.fit} fit)`,
    updated: new Date().toISOString().slice(0, 10),
    snippet: sizeProfile.masked
      ? 'Private measurements hidden'
      : `Bust ${formatMeasure(sizeProfile.bust, sizeProfile.unit)}, Waist ${formatMeasure(sizeProfile.waist, sizeProfile.unit)}, Hips ${formatMeasure(sizeProfile.hips, sizeProfile.unit)}`,
  });

  const sections = [];
  const caveats = [
    'Wishlist items, brand size charts, and upcoming occasion dates are prototype sample data stored locally in your browser.',
  ];
  const proposals = [];
  let headline = '';
  let highlightedProducts = [];

  if (askedOccasion) {
    const matchingItems = wishlist.filter(
      (it) =>
        it.occasion.toLowerCase().includes(askedOccasion) ||
        it.notes.toLowerCase().includes(askedOccasion) ||
        it.name.toLowerCase().includes(askedOccasion),
    );
    const calMatch = matches.find(
      (m) =>
        m.event.occasion.toLowerCase().includes(askedOccasion) ||
        m.event.title.toLowerCase().includes(askedOccasion),
    );

    const occasionLabel = askedOccasion.charAt(0).toUpperCase() + askedOccasion.slice(1);
    const itemsList = matchingItems.map((it) => {
      const rec = recommendSize(sizeProfile, it);
      const src = addSource('wishlist', 'Wishlist', {
        id: it.id,
        kind: 'note',
        title: `${it.name} (${it.brand})`,
        updated: it.savedAt,
        snippet: `${it.category} · ${it.occasion}${rec.recommendedSize ? ` · Recommended size ${rec.recommendedSize}` : ''}`,
      });
      highlightedProducts.push({ item: it, rec });

      const sizeDetail =
        rec.status === 'recommended' || rec.status === 'ambiguous'
          ? `Recommended size: ${rec.recommendedSize}${rec.runnerUpSize ? ` (or ${rec.runnerUpSize})` : ''}. ${rec.explanation}`
          : rec.explanation;

      return {
        text: `${it.name} from ${it.brand} (${it.category}).`,
        detail: sizeDetail,
        sourceIds: [src.source_id, profileSource.source_id],
      };
    });

    if (calMatch) {
      const calSrc = addSource('calendar', 'Calendar', {
        id: calMatch.event.id,
        kind: 'event',
        title: calMatch.event.title,
        date: calMatch.event.date,
        start: '19:00',
        end: '22:00',
        location: calMatch.event.location,
        attendees: [],
      });
      sections.push({
        title: `Matching ${occasionLabel} occasion`,
        items: [
          {
            text: `${calMatch.event.title} on ${fmtShortDate(calMatch.event.date)} (in ${calMatch.daysUntil} days).`,
            detail: calMatch.inWindow
              ? `Matches your ${calMatch.triggeredWindow}-day reminder preference.`
              : `Outside your current reminder window (${calMatch.daysUntil} days away).`,
            sourceIds: [calSrc.source_id],
          },
        ],
      });

      if (!(reminderPrefs?.approvedEventIds ?? []).includes(calMatch.event.id)) {
        const draftId = `rem_${calMatch.event.id}`;
        proposals.push({
          id: draftId,
          server: 'calendar',
          app: 'Calendar',
          tool: 'create_event',
          toolTitle: 'Create occasion reminder',
          args: {
            title: `Review ${occasionLabel} wishlist outfits`,
            date: calMatch.event.date,
            start: '10:00',
            end: '10:30',
            notes: `${matchingItems.length} saved item(s) tagged for ${occasionLabel}`,
          },
          why: `${calMatch.event.title} is in ${calMatch.daysUntil} days and matches ${matchingItems.length} saved wishlist item(s).`,
          sourceIds: [calSrc.source_id],
          status: 'pending',
          localAction: () => onApproveReminder?.(calMatch.event.id),
        });
        steps.push({
          id: stepId++,
          server: 'calendar',
          app: 'Calendar',
          tool: 'create_event',
          args: { title: `Review ${occasionLabel} wishlist outfits`, date: calMatch.event.date },
          kind: 'write',
          status: 'held',
          summary: 'waiting for your approval',
        });
      }
    }

    if (itemsList.length) {
      sections.unshift({ title: `Saved for ${occasionLabel}`, items: itemsList });
      headline = calMatch
        ? `You have ${matchingItems.length} saved ${matchingItems.length === 1 ? 'item' : 'items'} for ${occasionLabel}, coming up in ${calMatch.daysUntil} days.`
        : `You have ${matchingItems.length} saved ${matchingItems.length === 1 ? 'item' : 'items'} tagged for ${occasionLabel}.`;
    } else {
      headline = `You don't have any saved wishlist items tagged for ${occasionLabel} yet.`;
      sections.push({
        title: 'Next step',
        items: [
          {
            text: `Open Wishlist and add an outfit tagged “${occasionLabel}” to link it with your calendar.`,
            detail: calMatch ? `${calMatch.event.title} is in ${calMatch.daysUntil} days.` : '',
            sourceIds: [profileSource.source_id],
          },
        ],
      });
    }
  } else if (askedFitOrSize && mentionedItems.length > 0) {
    const targetItems = mentionedItems;
    steps.push({
      id: stepId++,
      server: 'wishlist',
      app: 'Size Intelligence',
      tool: 'compare_brand_size_charts',
      args: { brands: targetItems.map((t) => t.brand) },
      kind: 'read',
      status: 'done',
      summary: `${targetItems.length} brand charts checked`,
      ms: 5,
    });

    const fitItems = targetItems.map((it) => {
      const rec = recommendSize(sizeProfile, it);
      const chart = lookupBrandChart(it.brand, it.category);
      const src = addSource('wishlist', 'Wishlist', {
        id: it.id,
        kind: 'note',
        title: `${it.name} — ${it.brand}`,
        updated: it.savedAt,
        snippet: chart ? `Sample ${chart.brand} ${it.category} chart` : 'No size chart available',
      });
      highlightedProducts.push({ item: it, rec });
      return {
        text:
          rec.status === 'recommended' || rec.status === 'ambiguous'
            ? `${it.brand} — ${it.name}: Recommended size ${rec.recommendedSize}${rec.runnerUpSize ? ` (or ${rec.runnerUpSize})` : ''}.`
            : `${it.brand} — ${it.name}: No size recommendation available.`,
        detail: rec.explanation,
        sourceIds: [src.source_id, profileSource.source_id],
      };
    });

    headline =
      targetItems.length === 1
        ? (() => {
            const rec = highlightedProducts[0].rec;
            return rec.recommendedSize
              ? `Consider size ${rec.recommendedSize} in ${targetItems[0].brand} for the ${targetItems[0].name}.`
              : `I can't verify a size for ${targetItems[0].name} because ${targetItems[0].brand}'s size chart isn't available.`;
          })()
        : `Compared ${targetItems.length} saved items against their own brand size charts.`;
    sections.push({ title: 'Brand-specific size recommendations', items: fitItems });
  } else if (askedRevisit || (!askedFitOrSize && matches.length > 0)) {
    const upcoming = matches.filter((m) => m.daysUntil <= 45);
    const items = [];
    for (const m of upcoming) {
      const calSrc = addSource('calendar', 'Calendar', {
        id: m.event.id,
        kind: 'event',
        title: m.event.title,
        date: m.event.date,
        start: '19:00',
        end: '22:00',
        location: m.event.location,
        attendees: [],
      });
      for (const it of m.items) {
        const rec = recommendSize(sizeProfile, it);
        const wlSrc = addSource('wishlist', 'Wishlist', {
          id: it.id,
          kind: 'note',
          title: `${it.name} (${it.brand})`,
          updated: it.savedAt,
          snippet: `${it.occasion} · ${rec.recommendedSize ? `Size ${rec.recommendedSize}` : 'Chart unavailable'}`,
        });
        highlightedProducts.push({ item: it, rec });
        items.push({
          text: `${it.name} (${it.brand}) — for ${m.event.title} in ${m.daysUntil} days.`,
          detail: rec.recommendedSize
            ? `Recommended size: ${rec.recommendedSize} (${fmtShortDate(m.event.date)}).`
            : rec.explanation,
          sourceIds: [wlSrc.source_id, calSrc.source_id, profileSource.source_id],
        });
      }
    }
    headline = items.length
      ? `${items.length} saved ${items.length === 1 ? 'product matches' : 'products match'} your upcoming occasions.`
      : 'None of your saved products match upcoming calendar occasions in the next 45 days.';
    if (items.length) sections.push({ title: 'Products to revisit before upcoming occasions', items });
  } else {
    // General fit check across all wishlist items
    steps.push({
      id: stepId++,
      server: 'wishlist',
      app: 'Size Intelligence',
      tool: 'compare_brand_size_charts',
      args: { items: wishlist.length },
      kind: 'read',
      status: 'done',
      summary: `${wishlist.length} items evaluated`,
      ms: 5,
    });

    const matched = [];
    const unresolved = [];
    for (const it of wishlist) {
      const rec = recommendSize(sizeProfile, it);
      const src = addSource('wishlist', 'Wishlist', {
        id: it.id,
        kind: 'note',
        title: `${it.name} (${it.brand})`,
        updated: it.savedAt,
        snippet: rec.recommendedSize ? `Size ${rec.recommendedSize} (${it.occasion})` : `${it.occasion} · ${rec.status}`,
      });
      highlightedProducts.push({ item: it, rec });
      if (rec.status === 'recommended' || rec.status === 'ambiguous') {
        matched.push({
          text: `${it.brand} — ${it.name}: Size ${rec.recommendedSize}${rec.runnerUpSize ? ` / ${rec.runnerUpSize}` : ''}.`,
          detail: rec.explanation,
          sourceIds: [src.source_id, profileSource.source_id],
        });
      } else {
        unresolved.push({
          text: `${it.brand} — ${it.name}: ${rec.status === 'no_chart' ? 'No brand chart' : 'Needs profile measurements'}.`,
          detail: rec.explanation,
          sourceIds: [src.source_id],
        });
      }
    }

    headline = `${matched.length} of ${wishlist.length} saved items have verified brand size matches for your profile.`;
    if (matched.length) sections.push({ title: 'Matched to your measurements', items: matched });
    if (unresolved.length) sections.push({ title: 'Needs chart or measurements', items: unresolved });
  }

  const ms = Math.max(12, Math.round(performance.now() - started));

  return {
    id: `local_${Date.now()}`,
    mode: 'wishlist-local',
    question: q,
    steps,
    proposals,
    done: true,
    ms,
    highlightedProducts,
    answer: {
      headline,
      sections,
      caveats,
      sources,
      proposals,
      stats: {
        ms,
        reads: steps.filter((s) => s.kind === 'read').length,
        apps: [...new Set(steps.filter((s) => s.kind === 'read').map((s) => s.app))],
        mode: 'local-wishlist',
        model: null,
      },
    },
  };
}
