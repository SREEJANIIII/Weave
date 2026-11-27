import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const EMPTY = { name: '', brand: '', category: 'top', color: '', size: '', occasion: '', season: '', notes: '', imageName: '' };

export function WardrobeView({ enabled = false }) {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [preview, setPreview] = useState('');
  const [occasion, setOccasion] = useState('');
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => { const result = await api('/api/wardrobe'); if (result.ok) setItems(result.data.items ?? []); else setMessage(result.data.error ?? 'Wardrobe could not be loaded.'); };
  useEffect(() => { if (enabled) load(); }, [enabled]);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const chooseFile = (event) => { const file = event.target.files?.[0]; if (!file) return; setDraft((current) => ({ ...current, imageName: file.name, name: current.name || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') })); const reader = new FileReader(); reader.onload = () => setPreview(String(reader.result)); reader.readAsDataURL(file); setMessage('Review the garment details, then save it to Wardrobe.'); };
  const save = async (event) => { event.preventDefault(); setLoading(true); const result = await api('/api/wardrobe', draft); setLoading(false); if (!result.ok) return setMessage(result.data.error ?? 'Wardrobe item could not be saved.'); setItems((current) => [result.data.item, ...current]); setDraft(EMPTY); setPreview(''); setMessage('Saved to your wardrobe.'); };
  const recommend = async (event) => { event.preventDefault(); const result = await api('/api/wardrobe/recommend', { occasion }); if (result.ok) setOutfits(result.data.outfits ?? []); else setMessage(result.data.error ?? 'Recommendations are unavailable.'); };
  if (!enabled) return <section className="ap-card"><h1>Wardrobe</h1><p className="ap-muted">Turn on Wardrobe in the Apps panel to upload garments and get outfit recommendations.</p></section>;
  return <div className="wl-shell">
    <section className="wl-hero"><p className="eyebrow">Wardrobe</p><h1>Build a wardrobe that remembers what you own.</h1><p className="wl-lede">Upload a garment, review its details, save it, then ask for outfit ideas by occasion.</p></section>
    <div className="wl-grid">
      <section className="wl-card"><h2>Upload and review</h2><label className="wl-upload"><input type="file" accept="image/*" onChange={chooseFile} />Choose a garment photo</label>{preview ? <img className="wl-upload-preview" src={preview} alt="Garment being reviewed" /> : <p className="wl-muted">The image stays in this browser while you review it.</p>}<form onSubmit={save} className="wl-form">{['name', 'brand', 'category', 'color', 'size', 'occasion', 'season'].map((key) => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<input value={draft[key]} onChange={(e) => update(key, e.target.value)} required={key === 'name' || key === 'category'} /></label>)}<label>Notes<textarea value={draft.notes} onChange={(e) => update('notes', e.target.value)} /></label><button className="d-btn is-ink" disabled={loading || !draft.name || !draft.category}>{loading ? 'Saving…' : 'Save to Wardrobe'}</button></form></section>
      <section className="wl-card"><h2>Outfit recommendations</h2><form className="row-actions" onSubmit={recommend}><input placeholder="Occasion, e.g. wedding" value={occasion} onChange={(e) => setOccasion(e.target.value)} /><button className="d-btn is-line" type="submit">Suggest outfits</button></form>{outfits.length ? outfits.map((outfit) => <article className="wl-list-row" key={outfit.id}><strong>{outfit.items.map((item) => item.name).join(' + ')}</strong><span>{outfit.explanation}</span></article>) : <p className="wl-muted">Save a few garments, then choose an occasion.</p>}</section>
    </div>
    <section className="wl-card"><h2>Your wardrobe</h2>{items.length ? <div className="wl-list">{items.map((item) => <article className="wl-list-row" key={item.id}><strong>{item.name}</strong><span>{[item.brand, item.category, item.color, item.size].filter(Boolean).join(' · ')}</span><small>{item.occasion || 'Everyday'}</small></article>)}</div> : <p className="wl-muted">No garments saved yet.</p>}</section>{message ? <p className="wl-muted" role="status">{message}</p> : null}
  </div>;
}
