import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { FIELD_LABELS, KINDS, fmtDate, fmtMoney, imageFor, nounFor, summarize } from '../../lib/savedPapers';

const SOURCE_TEXT = {
  sample: 'Sample that comes with the prototype',
  claude: 'Read from a photo, checked by you',
  file: 'Read from a file, checked by you',
  typed: 'Typed in by you',
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'receipt', label: 'Receipts' },
  { id: 'warranty', label: 'Warranties' },
  { id: 'bill', label: 'Bills' },
  { id: 'notes', label: 'Notes' },
];
const inFilter = (item, f) => f === 'all' || (f === 'notes' ? ['event', 'workout', 'other'].includes(item.kind) : item.kind === f);

function questionFor(item) {
  const noun = nounFor(item);
  if (item.kind === 'receipt') return `When did I buy my ${noun}?`;
  if (item.kind === 'warranty') return `Show me the warranty for my ${noun}`;
  if (item.kind === 'bill') return /\bbill\b/i.test(item.title) ? `Show me my ${item.title.toLowerCase()}` : `Show me my ${noun} bill`;
  if (item.kind === 'other') return `Show me my ${noun}`;
  return null;
}

function valueFor(key, f) {
  if (['date', 'warranty_until', 'due_date'].includes(key)) return fmtDate(f[key]);
  if (key === 'amount') return fmtMoney(f.amount, f.currency);
  return f[key];
}

function Row({ item, open, fresh, onToggle, onAsk, onDelete }) {
  const ref = useRef(null);
  const img = imageFor(item);
  const labels = FIELD_LABELS[item.kind] ?? FIELD_LABELS.other;
  const question = questionFor(item);

  useEffect(() => {
    if (open) requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [open]);

  return (
    <li ref={ref} className={`srow${open ? ' is-open' : ''}${fresh ? ' is-fresh' : ''}`}>
      <button type="button" className="srow-head" aria-expanded={open} onClick={onToggle}>
        <span className="srow-thumb" aria-hidden="true">
          {img ? <img src={img} alt="" /> : <Icon name={KINDS[item.kind]?.icon ?? 'i-file'} />}
        </span>
        <span className="srow-text">
          <span className="srow-title">
            {item.title}
            {item.sample ? <span className="tag">Sample</span> : null}
          </span>
          <span className="srow-sub">{summarize(item) || KINDS[item.kind]?.label}</span>
        </span>
        <span className="srow-kind">{KINDS[item.kind]?.label}</span>
        <Icon name="i-chevron-down" className={`icon chev${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <div className="srow-body">
          {img ? <img className="srow-image" src={img} alt={`Photo of your ${item.title.toLowerCase()}`} /> : null}
          <div className="srow-info">
            <dl>
              {(KINDS[item.kind]?.fields ?? []).map((key) => {
                const v = valueFor(key, item.fields);
                return v ? (
                  <div key={key}>
                    <dt>{labels[key]}</dt>
                    <dd>{v}</dd>
                  </div>
                ) : null;
              })}
            </dl>
            {item.imageDropped ? <p className="fine">The photo wasn’t kept because this browser was out of room. The details are saved.</p> : null}
            <p className="fine">
              Saved {fmtDate(item.savedAt?.slice(0, 10))} · {SOURCE_TEXT[item.source] ?? 'Saved by you'}
            </p>
            <div className="row-actions">
              {question && (
                <button className="d-btn is-ink is-sm" type="button" onClick={() => onAsk(question)}>
                  Ask about it
                </button>
              )}
              <button className="d-btn is-plain is-sm" type="button" onClick={() => onDelete(item)}>
                <Icon name="i-trash" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export function SavedPage({ saved, focusId, freshId, onAsk, onDelete, onAdd }) {
  const [openId, setOpenId] = useState(focusId ?? null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (focusId) {
      setOpenId(focusId);
      setFilter('all');
    }
  }, [focusId]);

  const sorted = [...saved].sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
  const shown = sorted.filter((it) => inFilter(it, filter));
  const filters = FILTERS.filter((f) => f.id === 'all' || saved.some((it) => inFilter(it, f.id)));

  return (
    <div className="page">
      <header className="page-head has-action">
        <div>
          <h1>Saved</h1>
          <p>Receipts, warranties and notes you’ve added. They stay on this device, and you can ask about any of them.</p>
        </div>
        <button className="d-btn is-ink is-sm" type="button" onClick={onAdd}>
          <Icon name="i-plus" />
          Add
        </button>
      </header>

      {saved.length > 0 && filters.length > 2 && (
        <div className="seg-tabs" role="tablist" aria-label="Show">
          {filters.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'is-on' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {saved.length === 0 ? (
        <div className="page-empty">
          <span className="page-empty-icon" aria-hidden="true">
            <Icon name="i-archive" />
          </span>
          <p className="page-empty-title">Nothing saved yet</p>
          <p>Add a photo of a receipt or warranty card. Later you can just ask, “When did I buy my fridge?”</p>
          <button className="d-btn is-ink is-sm" type="button" onClick={onAdd}>
            <Icon name="i-camera" />
            Add a photo or file
          </button>
        </div>
      ) : (
        <ul className="slist">
          {shown.map((it) => (
            <Row
              key={it.id}
              item={it}
              open={openId === it.id}
              fresh={freshId === it.id}
              onToggle={() => setOpenId((cur) => (cur === it.id ? null : it.id))}
              onAsk={onAsk}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
