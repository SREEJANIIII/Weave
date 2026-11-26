import React, { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import {
  BRAND_SIZE_CHARTS,
  CATEGORIES,
  OCCASION_SUGGESTIONS,
  SAMPLE_IMAGE_PRESETS,
} from '../../data/wishlistSample';

const KNOWN_BRANDS = Object.values(BRAND_SIZE_CHARTS).map((b) => b.brand);

export function WishlistFormModal({ initialItem, onSave, onClose }) {
  const [name, setName] = useState(initialItem?.name ?? '');
  const [brand, setBrand] = useState(initialItem?.brand ?? '');
  const [category, setCategory] = useState(initialItem?.category ?? 'Dresses');
  const [occasion, setOccasion] = useState(initialItem?.occasion ?? 'Diwali');
  const [url, setUrl] = useState(initialItem?.url ?? '');
  const [image, setImage] = useState(initialItem?.image ?? SAMPLE_IMAGE_PRESETS[0].value);
  const [notes, setNotes] = useState(initialItem?.notes ?? '');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !brand.trim()) return;
    onSave({
      name: name.trim(),
      brand: brand.trim(),
      category,
      occasion: occasion.trim() || 'Casual',
      url: url.trim(),
      image: image.trim() || SAMPLE_IMAGE_PRESETS[0].value,
      notes: notes.trim(),
    });
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
              <label htmlFor="wl-url">Product URL</label>
              <input
                id="wl-url"
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

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

          <div className="wl-modal-foot">
            <button className="btn btn-link" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              <Icon name="i-check" />
              {initialItem ? 'Save changes' : 'Save to Wishlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

