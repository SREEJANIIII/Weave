import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { api } from '../../lib/api';

const CATEGORIES = [
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'dress', label: 'Dress' },
  { id: 'ethnic', label: 'Ethnic' },
  { id: 'outerwear', label: 'Outerwear' },
  { id: 'footwear', label: 'Footwear' },
  { id: 'accessory', label: 'Accessory' },
];

const OCCASION_CHIPS = ['Casual', 'College', 'Work', 'Dinner', 'Party', 'Wedding', 'Diwali', 'Travel'];

const EMPTY = {
  name: '',
  brand: '',
  category: 'top',
  color: '',
  size: '',
  occasion: 'Casual',
  season: '',
  notes: '',
  imageName: '',
  imageData: '',
};

/** Resize uploaded garment photo in browser so local thumbnail storage stays fast and compact. */
function compressImageFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve('');
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onerror = () => resolve(src.length <= 280_000 ? src : '');
      img.onload = () => {
        const maxSide = 360;
        const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function WardrobeView({ enabled = false, onOpenConnections }) {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [occasion, setOccasion] = useState('');
  const [outfits, setOutfits] = useState([]);
  const [recommendRan, setRecommendRan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await api('/api/wardrobe');
    if (result.ok) {
      setItems(result.data.items ?? []);
      setError('');
    } else {
      setError(result.data.error ?? 'Wardrobe could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const update = (key, value) => setDraft((cur) => ({ ...cur, [key]: value }));

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    const thumb = await compressImageFile(file);
    setDraft((cur) => ({
      ...cur,
      imageName: file.name,
      imageData: thumb,
      name: cur.name || baseName,
    }));
    setMessage('Photo added. Review the garment details below, then save.');
    setError('');
  };

  const resetForm = () => {
    setDraft(EMPTY);
    setEditingId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setDraft({
      name: item.name ?? '',
      brand: item.brand ?? '',
      category: item.category ?? 'top',
      color: item.color ?? '',
      size: item.size ?? '',
      occasion: item.occasion ?? '',
      season: item.season ?? '',
      notes: item.notes ?? '',
      imageName: item.imageName ?? '',
      imageData: item.imageData ?? '',
    });
    setMessage(`Editing “${item.name}”`);
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.category.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');
    const cleanPayload = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      ...(draft.brand.trim() ? { brand: draft.brand.trim() } : { brand: '' }),
      ...(draft.color.trim() ? { color: draft.color.trim() } : { color: '' }),
      ...(draft.size.trim() ? { size: draft.size.trim() } : { size: '' }),
      ...(draft.occasion.trim() ? { occasion: draft.occasion.trim() } : { occasion: '' }),
      ...(draft.season.trim() ? { season: draft.season.trim() } : { season: '' }),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : { notes: '' }),
      ...(draft.imageName ? { imageName: draft.imageName } : {}),
      ...(draft.imageData ? { imageData: draft.imageData } : {}),
    };
    const result = editingId
      ? await api(`/api/wardrobe/${encodeURIComponent(editingId)}`, cleanPayload, 'PATCH')
      : await api('/api/wardrobe', cleanPayload, 'POST');
    setLoading(false);
    if (!result.ok) {
      setError(result.data.error ?? 'Wardrobe item could not be saved.');
      return;
    }
    if (editingId) {
      setItems((cur) => cur.map((it) => (it.id === editingId ? result.data.item : it)));
      setMessage(`Updated “${result.data.item.name}”.`);
    } else {
      setItems((cur) => [result.data.item, ...cur]);
      setMessage(`Saved “${result.data.item.name}” to your wardrobe.`);
    }
    resetForm();
  };

  const removeItem = async (item) => {
    setError('');
    const result = await api(`/api/wardrobe/${encodeURIComponent(item.id)}`, undefined, 'DELETE');
    setConfirmId(null);
    if (!result.ok) {
      setError(result.data.error ?? 'Could not remove garment.');
      return;
    }
    setItems((cur) => cur.filter((it) => it.id !== item.id));
    setOutfits((cur) => cur.filter((o) => !(o.items ?? []).some((x) => x.id === item.id)));
    if (editingId === item.id) resetForm();
    setMessage(`Removed “${item.name}” from active wardrobe.`);
  };

  const recommend = async (event, overrideOccasion) => {
    if (event) event.preventDefault();
    const targetOcc = overrideOccasion !== undefined ? overrideOccasion : occasion;
    setRecommending(true);
    setError('');
    const result = await api('/api/wardrobe/recommend', { occasion: targetOcc });
    setRecommending(false);
    setRecommendRan(true);
    if (result.ok) {
      setOutfits(result.data.outfits ?? []);
    } else {
      setError(result.data.error ?? 'Recommendations are unavailable.');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (catFilter !== 'all' && (it.category || '').toLowerCase() !== catFilter) return false;
      if (q) {
        const hay = `${it.name} ${it.brand ?? ''} ${it.color ?? ''} ${it.occasion ?? ''} ${it.category ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, catFilter, search]);

  if (!enabled) {
    return (
      <div className="wl-shell">
        <div className="wl-head">
          <div>
            <h1 className="greeting">Wardrobe</h1>
            <p className="ask-sub">Save clothing you already own and generate outfit ideas for college, work, dinners, or weddings.</p>
          </div>
        </div>
        <div className="notice" role="status">
          <Icon name="i-alert" />
          <div>
            <strong>Wardrobe is switched off.</strong>
            <p>Turn on Wardrobe in Connections to save garments and suggest outfits from your closet.</p>
            {onOpenConnections && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={onOpenConnections}>
                Open Connections
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wl-shell">
      <div className="wl-page">
        <div className="wl-head">
          <div>
            <div className="wl-head-title-row">
              <h1 className="greeting">My Wardrobe</h1>
              <span className="wl-sample-tag">{items.length} active item{items.length === 1 ? '' : 's'}</span>
            </div>
            <p className="ask-sub">
              Save garments you own with optional photos. Ask Weave what to wear from your real closet — never confused with Wishlist items you haven&rsquo;t bought.
            </p>
          </div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={load} disabled={loading}>
            <Icon name="i-replay" />
            <span>Refresh</span>
          </button>
        </div>

        {(message || error) && (
          <div className={error ? 'notice wd-alert' : 'wl-caveats'} role="status">
            <Icon name={error ? 'i-alert' : 'i-check'} />
            <span>{error || message}</span>
          </div>
        )}

        <div className="sp-grid">
          {/* Left: Add / Edit Garment */}
          <form className="sp-card" onSubmit={save}>
            <div className="sp-card-head">
              <div>
                <h2>{editingId ? 'Edit garment' : 'Add to Wardrobe'}</h2>
                <p className="panel-note">Photos stay local and resize automatically for quick preview.</p>
              </div>
              {editingId && (
                <button type="button" className="btn btn-link btn-sm" onClick={resetForm}>
                  Cancel edit
                </button>
              )}
            </div>

            <div className="wd-photo-row">
              {draft.imageData ? (
                <div className="wd-photo-preview">
                  <img src={draft.imageData} alt={draft.name || 'Garment preview'} />
                  <button
                    type="button"
                    className="btn btn-link btn-sm"
                    onClick={() => setDraft((cur) => ({ ...cur, imageData: '', imageName: '' }))}
                  >
                    Remove photo
                  </button>
                </div>
              ) : (
                <p className="panel-note">No photo chosen yet (optional).</p>
              )}
              <label className="btn btn-quiet btn-sm wd-upload-btn">
                <Icon name="i-camera" />
                <span>{draft.imageData ? 'Change photo' : 'Choose garment photo'}</span>
                <input type="file" accept="image/*" hidden onChange={chooseFile} />
              </label>
            </div>

            <div className="sp-fields">
              <div className="field wl-span-2">
                <label htmlFor="wd-name">Garment name *</label>
                <input
                  id="wd-name"
                  type="text"
                  required
                  placeholder="e.g. Oxford Blue Shirt"
                  value={draft.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="wd-category">Category *</label>
                <select id="wd-category" value={draft.category} onChange={(e) => update('category', e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="wd-brand">Brand</label>
                <input
                  id="wd-brand"
                  type="text"
                  placeholder="e.g. Uniqlo, Fabindia"
                  value={draft.brand}
                  onChange={(e) => update('brand', e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="wd-color">Color</label>
                <input
                  id="wd-color"
                  type="text"
                  placeholder="e.g. Navy, Cream"
                  value={draft.color}
                  onChange={(e) => update('color', e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="wd-size">Size</label>
                <input
                  id="wd-size"
                  type="text"
                  placeholder="e.g. M, 32"
                  value={draft.size}
                  onChange={(e) => update('size', e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="wd-occasion">Occasion</label>
                <input
                  id="wd-occasion"
                  type="text"
                  list="wd-occ-list"
                  placeholder="e.g. College, Work, Wedding"
                  value={draft.occasion}
                  onChange={(e) => update('occasion', e.target.value)}
                />
                <datalist id="wd-occ-list">
                  {OCCASION_CHIPS.map((o) => <option key={o} value={o} />)}
                </datalist>
              </div>

              <div className="field">
                <label htmlFor="wd-season">Season</label>
                <input
                  id="wd-season"
                  type="text"
                  placeholder="All seasons, Summer, Winter"
                  value={draft.season}
                  onChange={(e) => update('season', e.target.value)}
                />
              </div>

              <div className="field wl-span-2">
                <label htmlFor="wd-notes">Notes</label>
                <textarea
                  id="wd-notes"
                  rows={2}
                  placeholder="Fabric care, pairing notes..."
                  value={draft.notes}
                  onChange={(e) => update('notes', e.target.value)}
                />
              </div>
            </div>

            <div className="sp-form-foot">
              <button type="submit" className="btn btn-primary" disabled={loading || !draft.name.trim()}>
                <Icon name="i-check" />
                <span>{loading ? 'Saving…' : editingId ? 'Save changes' : 'Save to Wardrobe'}</span>
              </button>
            </div>
          </form>

          {/* Right: Outfit Recommendations */}
          <section className="sp-card" aria-labelledby="wd-rec-title">
            <div className="sp-card-head">
              <div>
                <h2 id="wd-rec-title">Outfit recommendations</h2>
                <p className="panel-note">Pairs matching tops &amp; bottoms (or dresses/ethnic wear) from garments you actually own.</p>
              </div>
            </div>

            <div className="wl-filter-group" role="group" aria-label="Quick occasion">
              {['', 'College', 'Work', 'Casual', 'Dinner', 'Wedding'].map((occ) => (
                <button
                  key={occ || 'any'}
                  type="button"
                  className={`wl-pill-btn${occasion.toLowerCase() === occ.toLowerCase() ? ' is-on' : ''}`}
                  onClick={() => {
                    setOccasion(occ);
                    recommend(null, occ);
                  }}
                >
                  {occ || 'All occasions'}
                </button>
              ))}
            </div>

            <form className="cn-inline-form" onSubmit={(e) => recommend(e)}>
              <input
                type="text"
                placeholder="Occasion (e.g. wedding, college, office)"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" type="submit" disabled={recommending || items.length === 0}>
                {recommending ? 'Matching…' : 'Suggest outfits'}
              </button>
            </form>

            {outfits.length > 0 ? (
              <div className="wd-outfits">
                {outfits.map((outfit) => (
                  <article className="wd-outfit-card" key={outfit.id}>
                    <div className="wd-outfit-thumbs">
                      {(outfit.items ?? []).map((it) =>
                        it.imageData ? (
                          <img key={it.id} src={it.imageData} alt={it.name} />
                        ) : (
                          <span key={it.id} className="wd-thumb-ph" aria-hidden="true">
                            <Icon name="i-heart" />
                          </span>
                        ),
                      )}
                    </div>
                    <div className="wd-outfit-body">
                      <strong>{(outfit.items ?? []).map((item) => item.name).join(' + ')}</strong>
                      <span>{outfit.explanation}</span>
                      <div className="wd-chip-row">
                        {(outfit.items ?? []).map((it) => (
                          <span key={it.id} className="wl-cat">{it.category}{it.color ? ` · ${it.color}` : ''}</span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty wl-empty">
                <strong>{recommendRan ? 'No matching outfit yet' : 'Ready to pair outfits'}</strong>
                <p>
                  {items.length === 0
                    ? 'Save at least one or two garments on the left first.'
                    : 'Pick an occasion above and click Suggest outfits to generate combinations from your closet.'}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Bottom: Saved Garments Grid + Filters */}
        <section className="sp-card" aria-labelledby="wd-items-title">
          <div className="sp-card-head">
            <div>
              <h2 id="wd-items-title">Your wardrobe ({filtered.length})</h2>
            </div>
            <div className="wl-search" style={{ minWidth: 220 }}>
              <Icon name="i-search" />
              <input
                type="search"
                aria-label="Search wardrobe"
                placeholder="Search garments, colors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="wl-filter-group" role="group" aria-label="Filter wardrobe category">
            <button type="button" className={`wl-pill-btn${catFilter === 'all' ? ' is-on' : ''}`} onClick={() => setCatFilter('all')}>
              All ({items.length})
            </button>
            {CATEGORIES.map((c) => {
              const cnt = items.filter((i) => (i.category || '').toLowerCase() === c.id).length;
              if (!cnt) return null;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`wl-pill-btn${catFilter === c.id ? ' is-on' : ''}`}
                  onClick={() => setCatFilter(c.id)}
                >
                  {c.label} ({cnt})
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="empty wl-empty">
              <strong>{items.length === 0 ? 'Your wardrobe is empty' : 'No garments match these filters'}</strong>
              <p>{items.length === 0 ? 'Add shirts, trousers, dresses, or ethnic wear above to track what you own.' : 'Try clearing the category or search filter.'}</p>
            </div>
          ) : (
            <div className="wd-grid">
              {filtered.map((item) => (
                <article key={item.id} className="wl-card">
                  <div className="wl-card-media">
                    {item.imageData ? (
                      <img src={item.imageData} alt={item.name} />
                    ) : (
                      <div className="wl-card-img-fallback" aria-hidden="true">
                        <Icon name="i-heart" />
                      </div>
                    )}
                    {item.occasion && <span className="wl-occ-badge">{item.occasion}</span>}
                  </div>
                  <div className="wl-card-body">
                    <div className="wl-card-meta-top">
                      <span className="wl-brand">{item.brand || 'Owned'}</span>
                      <span className="wl-cat">{item.category}</span>
                    </div>
                    <h3 className="wl-card-title">{item.name}</h3>
                    <p className="wl-card-notes">
                      {[item.color, item.size && `Size ${item.size}`, item.season].filter(Boolean).join(' · ') || item.notes || 'Ready to pair'}
                    </p>
                    <div className="wl-card-actions">
                      <button type="button" className="btn btn-quiet btn-sm wl-find-size-btn" onClick={() => startEdit(item)}>
                        <Icon name="i-pencil" />
                        <span>Edit</span>
                      </button>
                      {confirmId === item.id ? (
                        <div className="wl-confirm-del">
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => removeItem(item)}>Remove</button>
                          <button type="button" className="btn btn-link btn-sm" onClick={() => setConfirmId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button type="button" className="btn btn-quiet btn-sm" aria-label={`Remove ${item.name}`} onClick={() => setConfirmId(item.id)}>
                          <Icon name="i-trash" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
