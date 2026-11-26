import React, { useEffect, useMemo, useState } from 'react';
import { useAppliances } from '../../hooks/useAppliances';

const FIELDS = [
  { key: 'name', label: 'Appliance', type: 'text' },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'model', label: 'Model', type: 'text' },
  { key: 'serialNumber', label: 'Serial number', type: 'text' },
  { key: 'purchaseDate', label: 'Purchase date', type: 'date' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'warrantyMonths', label: 'Warranty (months)', type: 'number' },
  { key: 'serviceDetails', label: 'Service details', type: 'text' },
  { key: 'amcProvider', label: 'AMC provider', type: 'text' },
];
const DEADLINE_LABELS = {
  warranty_expiry: 'Warranty expiry', service: 'Scheduled service', amc_renewal: 'AMC renewal',
  emi_payment: 'EMI / payment', return_window: 'Return / replacement', other: 'Other deadline',
};
const STATUS_LABELS = { found: 'Found', missing: 'Missing', unclear: 'Unclear', conflicting: 'Conflicting', derived: 'Derived', confirmed: 'Confirmed' };
const KIND_LABELS = { bill: 'Bill / invoice', warranty: 'Warranty card', service: 'Service record', amc: 'AMC', emi: 'EMI schedule', return: 'Return policy', other: 'Other' };
const daysUntil = (date, today) => {
  if (!date || !today) return null;
  return Math.round((new Date(`${date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
};

function Status({ status }) {
  return <span className={`ap-status ap-status-${status ?? 'missing'}`}>{STATUS_LABELS[status] ?? status ?? 'Missing'}</span>;
}

function DeadlineRow({ deadline, name, today, busy, onDone, onSave }) {
  const [date, setDate] = useState(deadline.dueDate);
  const days = daysUntil(deadline.dueDate, today);
  return (
    <li>
      <div>
        <strong>{DEADLINE_LABELS[deadline.type] ?? deadline.type}: {name}</strong>
        <span>{deadline.dueDate} · {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} day${days === 1 ? '' : 's'}`}{deadline.amount ? ` · ${deadline.currency ?? 'INR'} ${deadline.amount}` : ''}</span>
      </div>
      <span className="ap-actions">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} aria-label="Change confirmed due date" />
        <button className="btn btn-link btn-sm" type="button" disabled={busy || !date || date === deadline.dueDate} onClick={() => onSave(deadline.id, date)}>Save date</button>
        <button className="btn btn-quiet btn-sm" type="button" disabled={busy} onClick={() => onDone(deadline.id)}>Done</button>
      </span>
    </li>
  );
}

function ReviewForm({ document, appliances, onConfirm, busy }) {
  const [review, setReview] = useState(null);
  const [applianceId, setApplianceId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!document) return setReview(null);
    const fields = {};
    for (const { key } of FIELDS) {
      const field = document.extraction?.fields?.[key] ?? {};
      fields[key] = { include: ['found', 'derived', 'confirmed'].includes(field.status) && Boolean(field.value), value: field.value ?? '' };
    }
    const deadlines = (document.extraction?.deadlines ?? []).map((d) => ({
      include: ['found', 'derived'].includes(d.status) && Boolean(d.date),
      date: d.date ?? '',
      amount: d.amount ?? '',
    }));
    setReview({ fields, deadlines });
    setMessage('');
  }, [document?.id]);

  if (!document || !review) return null;
  const extracted = document.extraction ?? { fields: {}, deadlines: [], warnings: [] };

  const setField = (key, patch) => setReview((prev) => ({ ...prev, fields: { ...prev.fields, [key]: { ...prev.fields[key], ...patch } } }));
  const setDeadline = (index, patch) => setReview((prev) => ({ ...prev, deadlines: prev.deadlines.map((d, i) => (i === index ? { ...d, ...patch } : d)) }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    const fields = {};
    for (const { key } of FIELDS) {
      const entry = review.fields[key];
      if (entry?.include && String(entry.value).trim()) fields[key] = entry.value;
    }
    const deadlines = [];
    review.deadlines.forEach((entry, index) => {
      if (!entry.include || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return;
      deadlines.push({ index, confirmed: true, date: entry.date, ...(entry.amount !== '' && entry.amount !== null ? { amount: entry.amount } : {}) });
    });
    if (!Object.keys(fields).length && !applianceId) {
      setMessage('Confirm at least one field (or choose an existing appliance) before saving.');
      return;
    }
    try {
      await onConfirm(document.id, { fields, deadlines, applianceId: applianceId || undefined });
    } catch (error) {
      setMessage(error.message);
    }
  };

  const preview = `/api/appliances/documents/${encodeURIComponent(document.id)}/file`;
  return (
    <section className="ap-review ap-card" aria-labelledby="review-heading">
      <div className="ap-review-head">
        <div>
          <h3 id="review-heading">Review {document.originalName}</h3>
          <p className="ap-muted">{KIND_LABELS[document.kind] ?? document.kind} · {document.extraction?.method ?? 'no extraction'} · {Math.round(document.size / 1024)} KB</p>
        </div>
        <Status status={document.status === 'confirmed' ? 'confirmed' : 'found'} />
      </div>

      {(document.extraction?.warnings ?? []).length > 0 && (
        <ul className="ap-warnings">
          {document.extraction.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
        </ul>
      )}
      {document.error && <p className="ap-error" role="alert">AI extraction failed: {document.error}. You can still enter the details yourself below.</p>}

      <div className="ap-review-grid">
        <div className="ap-preview">
          <p className="ap-label">Original document (private)</p>
          {document.mimeType === 'application/pdf' ? (
            <iframe src={preview} title={`Preview of ${document.originalName}`} />
          ) : (
            <img src={preview} alt={`Preview of ${document.originalName}`} />
          )}
        </div>
        <form onSubmit={submit} className="ap-fields">
          <p className="ap-label">Extracted fields — tick only what is correct</p>
          <div className="ap-field-grid">
            {FIELDS.map(({ key, label, type }) => {
              const field = extracted.fields?.[key] ?? {};
              const entry = review.fields[key] ?? { include: false, value: '' };
              return (
                <label key={key} className="ap-field">
                  <span className="ap-field-title">
                    <input type="checkbox" checked={entry.include} onChange={(e) => setField(key, { include: e.target.checked })} disabled={busy} />
                    {label} <Status status={field.status} />
                  </span>
                  <input
                    type={type}
                    value={entry.value ?? ''}
                    onChange={(e) => setField(key, { value: e.target.value, include: true })}
                    placeholder={field.status === 'missing' ? 'Not documented — leave blank' : ''}
                    disabled={busy}
                  />
                  {field.evidence && <small>“{field.evidence}”</small>}
                  {Array.isArray(field.candidates) && field.candidates.length > 0 && <small>Options seen: {field.candidates.join(' · ')}</small>}
                </label>
              );
            })}
          </div>

          <p className="ap-label">Deadlines found in this document</p>
          {extracted.deadlines.length === 0 && <p className="ap-muted">No dates were found. Nothing will be scheduled unless you add a confirmed date elsewhere.</p>}
          {extracted.deadlines.map((deadline, index) => {
            const entry = review.deadlines[index] ?? { include: false, date: '', amount: '' };
            return (
              <div key={index} className="ap-deadline-row">
                <label className="ap-field-title">
                  <input type="checkbox" checked={entry.include} onChange={(e) => setDeadline(index, { include: e.target.checked })} disabled={busy} />
                  {DEADLINE_LABELS[deadline.type] ?? deadline.type} <Status status={deadline.status} />
                </label>
                <div className="ap-deadline-inputs">
                  <input type="date" value={entry.date} onChange={(e) => setDeadline(index, { date: e.target.value, include: true })} disabled={busy} aria-label={`${deadline.title} date`} />
                  {deadline.amount !== null && deadline.amount !== undefined && (
                    <input type="number" value={entry.amount} onChange={(e) => setDeadline(index, { amount: e.target.value, include: true })} disabled={busy} aria-label={`${deadline.title} amount`} />
                  )}
                </div>
                {deadline.evidence && <small>“{deadline.evidence}”</small>}
                {deadline.recurrence && <small>Repeats {deadline.recurrence.frequency}{deadline.recurrence.dayOfMonth ? ` on day ${deadline.recurrence.dayOfMonth}` : ''}.</small>}
              </div>
            );
          })}

          <label className="ap-link-select">
            Link to an existing appliance (optional)
            <select value={applianceId} onChange={(e) => setApplianceId(e.target.value)} disabled={busy}>
              <option value="">Create / match from confirmed identity fields</option>
              {appliances.map((a) => <option key={a.id} value={a.id}>{a.name || a.brand || 'Appliance'} — {a.brand ?? ''} {a.model ?? ''}</option>)}
            </select>
          </label>
          <div className="ap-form-foot">
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>Confirm &amp; save</button>
            <span className="ap-muted">Only ticked values become active reminders.</span>
          </div>
          {message && <p className="ap-error" role="alert">{message}</p>}
        </form>
      </div>
    </section>
  );
}

export function AppliancesView({ enabled }) {
  const { summary, details, loading, error, setError, load, openAppliance, upload, confirm, updateDeadline, reminderAction } = useAppliances(enabled);
  const [selectedId, setSelectedId] = useState(null);
  const [kind, setKind] = useState('bill');
  const [handwritten, setHandwritten] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => { load(); }, [load]);
  const selected = useMemo(() => summary.documents.find((d) => d.id === selectedId) ?? null, [summary.documents, selectedId]);
  const nameById = useMemo(() => new Map(summary.appliances.map((a) => [a.id, a.name || a.brand || 'Appliance'])), [summary.appliances]);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) return setNotice('Choose a PDF, JPG, JPEG or PNG file first.');
    setBusy(true);
    setNotice('');
    try {
      const doc = await upload(file, kind, handwritten);
      setSelectedId(doc.id);
      setFile(null);
      event.target.reset();
      setNotice('Document uploaded. Review what was extracted before confirming.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn, message) => {
    setBusy(true);
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
    if (message) setNotice(message);
  };

  if (!enabled) {
    return (
      <div className="ap-shell">
        <section className="ap-card"><h1>Appliances &amp; Bills</h1><p className="ap-muted">This app is switched off. Turn on “Appliances &amp; Bills” in the Apps panel to upload bills and see deadlines.</p></section>
      </div>
    );
  }

  return (
    <div className="ap-shell">
      <header className="ap-header">
        <div>
          <h1>Appliances &amp; Bills</h1>
          <p>Upload bills and warranty cards, check what Weave found, then confirm it. Deadlines and reminders only become active once you approve the details.</p>
        </div>
        <button className="btn btn-quiet btn-sm" type="button" onClick={load} disabled={busy}>Refresh</button>
      </header>

      {(error || notice) && (
        <p className={error ? 'ap-error ap-card' : 'ap-notice ap-card'} role="status">
          {error || notice}
          {error && <button className="btn btn-link btn-sm" type="button" onClick={() => { setError(''); load(); }}>Try again</button>}
        </p>
      )}

      <div className="ap-stats">
        <div className="ap-card"><strong>{summary.appliances.length}</strong><span>Appliances</span></div>
        <div className="ap-card"><strong>{summary.deadlines.length}</strong><span>Upcoming confirmed deadlines</span></div>
        <div className="ap-card"><strong>{summary.documents.length}</strong><span>Documents awaiting review</span></div>
      </div>

      <section className="ap-card" aria-labelledby="upload-heading">
        <h2 id="upload-heading">Add a document</h2>
        <form className="ap-upload" onSubmit={handleUpload}>
          <label className="ap-upload-file">
            File (PDF, JPG, JPEG or PNG, up to 15 MB)
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label>
            Document type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="ap-check">
            <input type="checkbox" checked={handwritten} onChange={(e) => setHandwritten(e.target.checked)} />
            Handwritten bill (use vision reading)
          </label>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy || loading}>{busy ? 'Working…' : 'Upload & extract'}</button>
        </form>
        <p className="ap-muted">Originals stay in a private local directory. The assistant never receives a filesystem path.</p>
      </section>

      {selected && <ReviewForm document={selected} appliances={summary.appliances} onConfirm={confirm} busy={busy} />}

      <div className="ap-columns">
        <section className="ap-card" aria-labelledby="pending-heading">
          <h2 id="pending-heading">Awaiting review</h2>
          {summary.documents.length === 0 && <p className="ap-muted">No documents are waiting for review.</p>}
          <ul className="ap-list">
            {summary.documents.map((doc) => (
              <li key={doc.id}>
                <button type="button" className={selectedId === doc.id ? 'is-selected' : ''} onClick={() => setSelectedId(doc.id)}>
                  <strong>{doc.originalName}</strong>
                  <span>{KIND_LABELS[doc.kind] ?? doc.kind} · {doc.extraction?.method ?? 'not extracted'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="ap-card" aria-labelledby="deadlines-heading">
          <h2 id="deadlines-heading">Upcoming deadlines</h2>
          {summary.deadlines.length === 0 && <p className="ap-muted">No confirmed deadlines in the next year.</p>}
          <ul className="ap-list">
            {summary.deadlines.map((deadline) => (
              <DeadlineRow
                key={deadline.id}
                deadline={deadline}
                name={nameById.get(deadline.applianceId) ?? 'Appliance'}
                today={summary.today}
                busy={busy}
                onDone={(id) => act(() => updateDeadline(id), 'Deadline marked complete.')}
                onSave={(id, dueDate) => act(() => updateDeadline(id, { dueDate }), 'Confirmed date saved; reminders were refreshed.')}
              />
            ))}
          </ul>
        </section>
      </div>

      <div className="ap-columns">
        <section className="ap-card" aria-labelledby="appliances-heading">
          <h2 id="appliances-heading">My appliances</h2>
          {summary.appliances.length === 0 && <p className="ap-muted">Confirm a document to create your first appliance.</p>}
          <ul className="ap-list">
            {summary.appliances.map((appliance) => (
              <li key={appliance.id}>
                <button type="button" className={details?.appliance?.id === appliance.id ? 'is-selected' : ''} onClick={() => openAppliance(appliance.id)}>
                  <strong>{appliance.name || appliance.brand || 'Appliance'}</strong>
                  <span>{[appliance.brand, appliance.model, appliance.serialNumber && `S/N ${appliance.serialNumber}`].filter(Boolean).join(' · ') || 'No identity details confirmed'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="ap-card" aria-labelledby="reminders-heading">
          <h2 id="reminders-heading">Reminders</h2>
          {summary.reminders.length === 0 && <p className="ap-muted">Confirm a document to generate reminders before deadlines.</p>}
          <ul className="ap-list">
            {summary.reminders.slice(0, 30).map((reminder) => (
              <li key={reminder.id}>
                <div>
                  <strong>{reminder.title} · {reminder.status}</strong>
                  <span>Remind on {reminder.remindAt} · due {reminder.dueDate} ({reminder.windowDays} days before)</span>
                </div>
                <span className="ap-actions">
                  {reminder.status !== 'dismissed' && <button className="btn btn-link btn-sm" type="button" disabled={busy} onClick={() => act(() => reminderAction(reminder.id, 'dismiss'), 'Reminder dismissed.')}>Dismiss</button>}
                  {reminder.status !== 'completed' && <button className="btn btn-link btn-sm" type="button" disabled={busy} onClick={() => act(() => reminderAction(reminder.id, 'complete'), 'Reminder completed.')}>Done</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {details && (
        <section className="ap-card" aria-labelledby="details-heading">
          <h2 id="details-heading">{details.appliance.name || 'Appliance details'}</h2>
          <dl className="ap-details">
            <div><dt>Brand / model</dt><dd>{[details.appliance.brand, details.appliance.model].filter(Boolean).join(' · ') || 'Not confirmed'}</dd></div>
            <div><dt>Serial number</dt><dd>{details.appliance.serialNumber ?? 'Not confirmed'}</dd></div>
            <div><dt>Purchase date</dt><dd>{details.appliance.purchaseDate ?? 'Not confirmed'}</dd></div>
            <div><dt>Price</dt><dd>{details.appliance.price ? `${details.appliance.currency ?? 'INR'} ${details.appliance.price}` : 'Not confirmed'}</dd></div>
          </dl>
          <h3>Linked documents ({details.documents.length})</h3>
          <ul className="ap-list ap-list-inline">
            {details.documents.map((doc) => <li key={doc.id}>{doc.originalName} · {doc.status}</li>)}
            {details.documents.length === 0 && <li className="ap-muted">No linked documents.</li>}
          </ul>
          <h3>Confirmed deadlines ({details.deadlines.length})</h3>
          <ul className="ap-list ap-list-inline">
            {details.deadlines.map((d) => <li key={d.id}>{DEADLINE_LABELS[d.type] ?? d.type} · {d.dueDate}{d.amount ? ` · ${d.currency ?? 'INR'} ${d.amount}` : ''}</li>)}
            {details.deadlines.length === 0 && <li className="ap-muted">No confirmed deadlines.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
