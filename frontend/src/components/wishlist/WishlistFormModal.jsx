import React, { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import {
  BRAND_SIZE_CHARTS,
  CATEGORIES,
  OCCASION_SUGGESTIONS,
  SAMPLE_IMAGE_PRESETS,
} from '../../data/wishlistSample';

const KNOWN_BRANDS = Object.values(BRAND_SIZE_CHARTS).map((b) => b.brand);

export function WishlistFormModal({ initialItem, syncMode = 'local', onSave, onClose }) {
  const [name, setName] = useState(initialItem?.name ?? '');
  const [brand, setBrand] = useState(initialItem?.brand ?? '');
  const [category, setCategory] = useState(initialItem?.category ?? 'Dresses');
  const [occasion, setOccasion] = useState(initialItem?.occasion ?? 'Diwali');
  const [url, setUrl] = useState(initialItem?.url ?? '');
  const [image, setImage] = useState(initialItem?.rawImage || initialItem?.image || SAMPLE_IMAGE_PRESETS[0].value);
  const [price, setPrice] = useState(initialItem?.price ?? '');
  const [status, setStatus] = useState(initialItem?.status ?? 'saved');
  const [notes, setNotes] = useState(initialItem?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !brand.trim()) return;
    let normalizedUrl = url.trim();
    if (normalizedUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    if (syncMode === 'backend' && !normalizedUrl) {
      setFormError('Product URL (https://...) is required to save to MongoDB.');
      return;
    }
    setSaving(true);
    setFormError('');
    const result = await onSave({
      name: name.trim(),
      brand: brand.trim(),
      category,
      occasion: occasion.trim() || 'Casual',
      url: normalizedUrl,
      image: image.trim() || SAMPLE_IMAGE_PRESETS[0].value,
      price: price !== '' && price !== null ? Number(price) : undefined,
      status: initialItem ? status : 'saved',
      notes: notes.trim(),
    });
    setSaving(false);
    if (result && result.ok === false) {
      setFormError(result.error || 'Could not save product.');
    }
  };

  return (
    <div className="wl-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="wl-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wl-form-title"
      >
        <div className="wl-modal-head">
          <h2 id="wl-form-title">{initialItem ? 'Edit wishlist product' : 'Add to Smart Wishlist'}</h2>
          <button className="wl-icon-btn" type="button" aria-label="Close form" onClick={onClose}>
            <Icon name="i-x" />
          </button>
        </div>

        <form className="wl-form" onSubmit={handleSubmit}>
          <div className="wl-form-grid">
            <div className="field wl-span-2">
              <label htmlFor="wl-name">Product name *</label>
              <input
                id="wl-name"
                type="text"
                required
                placeholder="e.g. Chanderi Silk Kurta Set"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="wl-brand">Brand name *</label>
              <input
                id="wl-brand"
                type="text"
                required
                list="wl-brands-list"
                placeholder="e.g. Aurelia Studio, Soraia"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
              <datalist id="wl-brands-list">
                {KNOWN_BRANDS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="wl-category">Category</label>
              <select id="wl-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="wl-occasion">Occasion tag</label>
              <input
                id="wl-occasion"
                type="text"
                list="wl-occasions-list"
                placeholder="Diwali, Wedding, Birthday..."
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
              />
              <datalist id="wl-occasions-list">
                {OCCASION_SUGGESTIONS.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="wl-url">Product URL{syncMode === 'backend' ? ' *' : ''}</label>
              <div className="cn-inline-form">
                <input
                  id="wl-url"
                  type="text"
                  required={syncMode === 'backend'}
                  placeholder="https://example.com/product"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                {syncMode === 'backend' && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={fetchingMeta || !url.trim()}
                    onClick={async () => {
                      setFetchingMeta(true);
                      setFormError('');
                      try {
                        const res = await fetch('/api/connections/wishlist/preview-url', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: url.trim() }),
                        });
                        const data = await res.json();
                        if (!res.ok) setFormError(data.error || 'Preview unavailable.');
                        else {
                          const m = data.meta ?? {};
                          if (m.name && !name.trim()) setName(m.name);
                          if (m.brand && !brand.trim()) setBrand(m.brand);
                          if (m.image) setImage(m.image);
                          if (m.price !== undefined && !price) setPrice(String(m.price));
                        }
                      } catch {
                        setFormError('Could not preview product URL.');
                      } finally {
                        setFetchingMeta(false);
                      }
                    }}
                  >
                    {fetchingMeta ? 'Reading...' : 'Auto-fill'}
                  </button>
                )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="wl-price">Price (INR, optional)</label>
              <input
                id="wl-price"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 4200"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            {initialItem && (
              <div className="field">
                <label htmlFor="wl-status">Status</label>
                <select id="wl-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="saved">Saved</option>
                  <option value="purchased">Purchased</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            )}

            <div className="field wl-span-2">
              <label htmlFor="wl-image">Product image URL (or pick a sample preview)</label>
              <input
                id="wl-image"
                type="text"
                placeholder="/wishlist/dress-cobalt.svg or https://..."
                value={image}
                onChange={(e) => setImage(e.target.value)}
              />
              <div className="wl-preset-row" aria-label="Sample image presets">
                {SAMPLE_IMAGE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`wl-preset-chip${image === p.value ? ' is-selected' : ''}`}
                    onClick={() => setImage(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field wl-span-2">
              <label htmlFor="wl-notes">Optional notes</label>
              <textarea
                id="wl-notes"
                rows={2}
                placeholder="Fabric notes, styling ideas, or delivery timing..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {formError && (
            <p className="draft-result is-bad" role="alert">
              <Icon name="i-alert" />
              <span>{formError}</span>
            </p>
          )}

          <div className="wl-modal-foot">
            <button className="btn btn-link" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              <Icon name="i-check" />
              {saving ? 'Saving...' : initialItem ? 'Save changes' : 'Save to Wishlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

