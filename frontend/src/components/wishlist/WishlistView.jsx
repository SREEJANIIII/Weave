import React, { useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { CATEGORIES } from '../../data/wishlistSample';
import { money } from '../../lib/formatters';
import { getItemEventMatch, matchOccasions } from '../../lib/occasionMatcher';
import { recommendSize } from '../../lib/sizeEngine';
import { WishlistFormModal } from './WishlistFormModal';

const OCCASION_YARN = {
  diwali: 'calendar',
  wedding: 'wishlist',
  birthday: 'notes',
  party: 'email',
  vacation: 'money',
  festival: 'calendar',
  casual: 'tasks',
};

const STATUS_FILTERS = [
  { id: 'all', label: 'All items' },
  { id: 'saved', label: 'Saved' },
  { id: 'purchased', label: 'Purchased' },
  { id: 'archived', label: 'Archived' },
];

function yarnForOccasion(occ = '') {
  const key = occ.trim().toLowerCase();
  return OCCASION_YARN[key] ?? 'wishlist';
}

function fmtSavedDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="wl-card-img-fallback" aria-hidden="true">
        <Icon name="i-heart" />
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function WishlistView({
  wishlist,
  sizeProfile,
  occasions,
  reminderPrefs,
  backendReminders = [],
  syncMode = 'local',
  calendarEnabled = false,
  syncing = false,
  serverToday,
  onAdd,
  onUpdate,
  onRemove,
  onDismissReminder,
  onReconcileReminders,
  onInspectSize,
  onGoToProfile,
}) {
  const [search, setSearch] = useState('');
  const [occasionFilter, setOccasionFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('saved');
  const [fitFilter, setFitFilter] = useState('all'); // 'all' | 'matched'
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [reconciling, setReconciling] = useState(false);

  const occasionMatches = useMemo(
    () => matchOccasions(wishlist, occasions, reminderPrefs, serverToday, backendReminders),
    [wishlist, occasions, reminderPrefs, serverToday, backendReminders],
  );

  const activeReminders = useMemo(
    () => occasionMatches.filter((m) => m.inWindow && !m.dismissed),
    [occasionMatches],
  );

  const availableOccasions = useMemo(() => {
    const tags = new Set(wishlist.map((w) => w.occasion).filter(Boolean));
    return ['All', ...tags];
  }, [wishlist]);

  const enriched = useMemo(() => {
    return wishlist.map((item) => {
      const sizeRec = recommendSize(sizeProfile, item);
      const eventMatch = getItemEventMatch(item, occasionMatches);
      return { item, sizeRec, eventMatch };
    });
  }, [wishlist, sizeProfile, occasionMatches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ item, sizeRec }) => {
      const st = item.status || 'saved';
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (occasionFilter !== 'All' && (item.occasion || '').toLowerCase() !== occasionFilter.toLowerCase()) return false;
      if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
      if (fitFilter === 'matched' && !sizeRec.recommendedSize) return false;
      if (q) {
        const hay = `${item.name} ${item.brand} ${item.occasion} ${item.category} ${item.notes} ${item.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, statusFilter, occasionFilter, categoryFilter, fitFilter, search]);

  const sourceBadge =
    syncMode === 'backend'
      ? 'MongoDB + Wishlist MCP'
      : syncMode === 'disabled'
        ? 'Wishlist & sizes switched off in Apps'
        : 'Local sample data · Backend offline';

  return (
    <div className="wl-page">
      <div className="wl-head">
        <div>
          <div className="wl-head-title-row">
            <h1 className="greeting">Smart Wishlist</h1>
            <span className="wl-sample-tag">{sourceBadge}</span>
          </div>
          <p className="ask-sub">
            Save products by occasion, compare them with your private measurements against each brand&rsquo;s chart, and catch upcoming calendar events before it&rsquo;s too late.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={syncMode === 'disabled'}
          onClick={() => {
            setEditingItem(null);
            setFormOpen(true);
          }}
        >
          <Icon name="i-plus" />
          <span>Add product</span>
        </button>
      </div>

      {syncMode === 'disabled' && (
        <div className="notice" role="status">
          <Icon name="i-alert" />
          <div>
            <strong>Wishlist &amp; sizes is switched off.</strong>
            <p>Enable Wishlist &amp; sizes in the Ask Weave Apps inspector to load or save items from MongoDB.</p>
          </div>
        </div>
      )}

      {/* Contextual Calendar Occasion Reminders */}
      {(activeReminders.length > 0 || (syncMode === 'backend' && calendarEnabled)) && (
        <section className="wl-reminders" aria-label="Upcoming occasion reminders">
          <div className="wl-reminders-head">
            <span className="wl-reminders-title">
              <Icon name="i-bell" />
              Upcoming occasion reminders
            </span>
            <div className="wl-reminders-head-actions">
              {syncMode === 'backend' && calendarEnabled && onReconcileReminders && (
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  disabled={reconciling || syncing}
                  onClick={async () => {
                    setReconciling(true);
                    await onReconcileReminders();
                    setReconciling(false);
                  }}
                >
                  <Icon name="i-replay" />
                  <span>{reconciling ? 'Syncing...' : 'Sync reminders'}</span>
                </button>
              )}
              <button className="btn btn-link btn-sm" type="button" onClick={onGoToProfile}>
                Customise reminder timing
              </button>
            </div>
          </div>

          {activeReminders.length === 0 ? (
            <p className="panel-note">
              No active reminders within your lead windows. Click Sync reminders after adding wishlist occasions or calendar events.
            </p>
          ) : (
            <div className="wl-reminders-list">
              {activeReminders.map((m) => (
                <div key={m.id} className="wl-reminder-card" data-yarn={yarnForOccasion(m.event.occasion)}>
                  <div className="wl-reminder-main">
                    <div className="wl-reminder-top">
                      <span className="swatch" data-yarn={yarnForOccasion(m.event.occasion)} aria-hidden="true" />
                      <strong>{m.event.title}</strong>
                      <span className="wl-day-pill">
                        {m.daysUntil === 0 ? 'Today' : `In ${m.daysUntil} days`}
                      </span>
                      {m.triggeredWindow && (
                        <span className="wl-window-pill">{m.triggeredWindow}-day reminder</span>
                      )}
                      {m.backendStatus && (
                        <span className="wl-sample-tag">DB: {m.backendStatus}</span>
                      )}
                    </div>
                    <p className="wl-reminder-sub">
                      {`${m.items.length} saved ${m.items.length === 1 ? 'item matches' : 'items match'}: ${m.items
                        .map((it) => `${it.name} (${it.brand})`)
                        .join(', ')}`}
                    </p>
                  </div>
                  <div className="wl-reminder-actions">
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      onClick={() => setOccasionFilter(m.event.occasion)}
                    >
                      Show items
                    </button>
                    <button
                      className="btn btn-link btn-sm"
                      type="button"
                      aria-label={`Dismiss reminder for ${m.event.title}`}
                      onClick={() => onDismissReminder(m.event.id, m.backendReminderIds)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Search & Filters */}
      <div className="wl-controls">
        <div className="wl-search">
          <Icon name="i-search" />
          <input
            type="search"
            aria-label="Search wishlist products"
            placeholder="Search products, brands, occasions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="wl-filter-group" role="group" aria-label="Filter by occasion">
          {availableOccasions.map((occ) => (
            <button
              key={occ}
              type="button"
              className={`wl-pill-btn${occasionFilter === occ ? ' is-on' : ''}`}
              onClick={() => setOccasionFilter(occ)}
            >
              {occ}
            </button>
          ))}
        </div>

        <div className="wl-filter-row">
          <div className="wl-filter-group" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st.id}
                type="button"
                className={`wl-pill-btn${statusFilter === st.id ? ' is-on' : ''}`}
                onClick={() => setStatusFilter(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>

          <label className="wl-select-inline">
            <span>Category</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="All">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`wl-pill-btn${fitFilter === 'matched' ? ' is-on' : ''}`}
            onClick={() => setFitFilter((f) => (f === 'matched' ? 'all' : 'matched'))}
          >
            Has size match only
          </button>
          {(occasionFilter !== 'All' || categoryFilter !== 'All' || statusFilter !== 'saved' || fitFilter !== 'all' || search) && (
            <button
              type="button"
              className="btn btn-link btn-sm"
              onClick={() => {
                setOccasionFilter('All');
                setCategoryFilter('All');
                setStatusFilter('saved');
                setFitFilter('all');
                setSearch('');
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Product Grid */}
      {filtered.length === 0 ? (
        <div className="empty wl-empty">
          <strong>No matching wishlist items</strong>
          <p>Try switching status/occasion filters or add a new product to track for an upcoming occasion.</p>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={syncMode === 'disabled'}
            onClick={() => {
              setEditingItem(null);
              setFormOpen(true);
            }}
          >
            Add product
          </button>
        </div>
      ) : (
        <div className="wl-grid">
          {filtered.map(({ item, sizeRec, eventMatch }) => {
            const occYarn = yarnForOccasion(item.occasion);
            const isRemoving = confirmRemoveId === item.id;
            const itemStatus = item.status || 'saved';

            return (
              <article key={item.id} className={`wl-card${itemStatus !== 'saved' ? ' is-muted-card' : ''}`} data-yarn={occYarn}>
                <div className="wl-card-media">
                  <ProductImage src={item.image} alt={`${item.name} by ${item.brand}`} />
                  {item.occasion && (
                    <span className="wl-occ-badge" data-yarn={occYarn}>
                      {item.occasion}
                    </span>
                  )}
                  {(item.isSample || itemStatus !== 'saved') && (
                    <span className="wl-img-sample">
                      {itemStatus !== 'saved' ? itemStatus : 'Sample'}
                    </span>
                  )}
                </div>

                <div className="wl-card-body">
                  <div className="wl-card-meta-top">
                    <span className="wl-brand">{item.brand}</span>
                    <span className="wl-cat">
                      {item.category}
                      {item.price ? ` · ${money.format(item.price)}` : ''}
                    </span>
                  </div>
                  <h2 className="wl-card-title">{item.name}</h2>

                  {(item.notes || item.description) && (
                    <p className="wl-card-notes">{item.notes || item.description}</p>
                  )}

                  <div className="wl-card-signals">
                    <span
                      className={`wl-size-chip is-${sizeRec.status}`}
                      title={sizeRec.explanation}
                    >
                      <Icon name="i-ruler" />
                      {sizeRec.status === 'recommended'
                        ? `Size ${sizeRec.recommendedSize}`
                        : sizeRec.status === 'ambiguous'
                          ? `Size ${sizeRec.recommendedSize} / ${sizeRec.runnerUpSize}`
                          : sizeRec.status === 'no_chart'
                            ? 'Chart unavailable'
                            : 'Needs profile'}
                    </span>

                    {eventMatch && (
                      <span className="wl-cal-chip" title={`Matched with calendar: ${eventMatch.event.title}`}>
                        <Icon name="i-calendar" />
                        {eventMatch.daysUntil === 0 ? 'Today' : `In ${eventMatch.daysUntil}d`}
                      </span>
                    )}
                  </div>

                  <div className="wl-card-foot">
                    <span className="wl-saved-date">Saved {fmtSavedDate(item.savedAt)}</span>
                    <div className="wl-card-links">
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        disabled={syncMode === 'disabled'}
                        onClick={() =>
                          onUpdate(item.id, {
                            status: itemStatus === 'saved' ? 'purchased' : 'saved',
                          })
                        }
                      >
                        {itemStatus === 'saved' ? 'Mark purchased' : 'Move to saved'}
                      </button>
                      {item.url && (
                        <a
                          className="wl-ext-link"
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open saved product link"
                        >
                          <span>View link</span>
                          <Icon name="i-external" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="wl-card-actions">
                    <button
                      className="btn btn-primary btn-sm wl-find-size-btn"
                      type="button"
                      onClick={() => onInspectSize?.(item)}
                    >
                      <Icon name="i-ruler" />
                      <span>Find My Size</span>
                    </button>

                    {isRemoving ? (
                      <div className="wl-confirm-del">
                        <button
                          className="btn btn-quiet btn-sm"
                          type="button"
                          onClick={() => {
                            onRemove(item.id);
                            setConfirmRemoveId(null);
                          }}
                        >
                          Remove
                        </button>
                        <button
                          className="btn btn-link btn-sm"
                          type="button"
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="btn btn-quiet btn-sm"
                          type="button"
                          aria-label={`Edit ${item.name}`}
                          disabled={syncMode === 'disabled'}
                          onClick={() => {
                            setEditingItem(item);
                            setFormOpen(true);
                          }}
                        >
                          <Icon name="i-pencil" />
                        </button>
                        <button
                          className="btn btn-quiet btn-sm"
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          disabled={syncMode === 'disabled'}
                          onClick={() => setConfirmRemoveId(item.id)}
                        >
                          <Icon name="i-trash" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formOpen && (
        <WishlistFormModal
          initialItem={editingItem}
          syncMode={syncMode}
          onClose={() => {
            setFormOpen(false);
            setEditingItem(null);
          }}
          onSave={async (payload) => {
            const res = editingItem ? await onUpdate(editingItem.id, payload) : await onAdd(payload);
            if (!res || res.ok !== false) {
              setFormOpen(false);
              setEditingItem(null);
            }
            return res;
          }}
        />
      )}
    </div>
  );
}
