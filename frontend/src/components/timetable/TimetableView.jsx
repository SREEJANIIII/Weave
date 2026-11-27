import React, { useEffect, useState } from 'react';
import { api, ownerHeaders } from '../../lib/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function TimetableView({ enabled = false }) {
  const [document, setDocument] = useState(null);
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { const r = await api('/api/timetable/entries'); if (r.ok) setEntries(r.data.entries ?? []); else setMessage(r.data.error ?? 'Timetable could not be loaded.'); };
  useEffect(() => { if (enabled) load(); }, [enabled]);
  const upload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); const body = new FormData(); body.append('file', file);
    const r = await fetch('/api/timetable/upload', { method: 'POST', headers: ownerHeaders(), body });
    const data = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setMessage(data.error ?? 'Timetable upload failed.');
    setDocument(data.document); setEntries(data.entries ?? []); setMessage('Review the extracted rows before confirming them.');
  };
  const edit = (index, key, value) => setEntries((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const remove = (index) => setEntries((current) => current.filter((_, i) => i !== index));
  const confirm = async () => { if (!document) return; setBusy(true); const r = await api(`/api/timetable/documents/${encodeURIComponent(document._id)}/confirm`, { entries }); setBusy(false); if (!r.ok) return setMessage(r.data.error ?? 'Timetable confirmation failed.'); setDocument(null); setEntries(r.data.entries ?? entries); setMessage('Timetable confirmed. These recurring classes are now available to Weave.'); };
  if (!enabled) return <div className="wl-shell"><section className="sp-card"><h1>Timetable</h1><p className="panel-note">Turn on Timetable in Connections to upload and query your recurring classes.</p></section></div>;
  return <div className="wl-shell"><section className="wl-hero"><p className="eyebrow">Timetable</p><h1>Your weekly classes, ready to ask about.</h1><p className="wl-lede">Upload a timetable PDF, review every extracted row, and confirm only what is correct.</p></section><section className="wl-card"><h2>Upload timetable PDF</h2><input type="file" accept="application/pdf,.pdf" onChange={upload} disabled={busy} />{message ? <p className="wl-muted" role="status">{message}</p> : null}</section>{document ? <section className="wl-card"><h2>Review extracted timetable</h2><div className="wl-list">{entries.map((item, index) => <div className="wl-list-row" key={`${item.day}-${item.startTime}-${index}`}><select value={item.day} onChange={(e) => edit(index, 'day', e.target.value)}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select><input value={item.startTime} onChange={(e) => edit(index, 'startTime', e.target.value)} /><input value={item.endTime} onChange={(e) => edit(index, 'endTime', e.target.value)} /><input value={item.subject} onChange={(e) => edit(index, 'subject', e.target.value)} /><button className="d-btn is-plain" type="button" onClick={() => remove(index)}>Remove</button></div>)}</div><button className="d-btn is-ink" type="button" disabled={busy || !entries.length} onClick={confirm}>Confirm timetable</button></section> : null}<section className="wl-card"><h2>Confirmed classes</h2>{entries.length && !document ? <div className="wl-list">{entries.map((item) => <div className="wl-list-row" key={item.id}><strong>{item.day} · {item.startTime}–{item.endTime}</strong><span>{item.subject}{item.location ? ` · ${item.location}` : ''}</span></div>)}</div> : <p className="wl-muted">No confirmed timetable entries yet.</p>}</section></div>;
}
