import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Sheet } from './Sheet';
import { FIELD_LABELS, FIELD_TYPES, KINDS, imageFor, nounFor, sampleUpload, summarize } from '../../lib/savedPapers';
import { blankDetails, prepareFile, readLocally, suggestTitle } from '../../lib/readFile';

const KIND_ORDER = ['receipt', 'warranty', 'bill', 'event', 'workout', 'other'];

function bannerFor(source, reason, unsureCount) {
  if (source === 'sample') {
    return { tone: 'info', text: `This is a sample receipt with made-up details, filled in the way Weave would read it. ${unsureCount ? 'Fix the field marked “Check this”, then save it.' : 'Check the details, then save it.'}` };
  }
  if (source === 'file') return { tone: 'ok', text: 'I read this file. Check the details before you save it.' };
  if (reason === 'declined') return { tone: 'info', text: 'Okay, I won’t send it anywhere. Add the details you’d like to keep; even a name and a date helps.' };
  if (reason === 'unavailable') return { tone: 'info', text: 'I can’t read photos in this setup, so nothing is filled in yet. Add the details you’d like to keep; even a name and a date helps.' };
  if (reason === 'offline') return { tone: 'info', text: 'Weave’s server is out of reach. Add the details you’d like to keep; even a name and a date helps.' };
  if (reason?.message) return { tone: 'warn', text: `${reason.message} ${reason.hint ?? ''}`.trim() };
  return { tone: 'info', text: 'Add the details you’d like to keep.' };
}

function questionFor(item) {
  const noun = nounFor(item);
  if (item.kind === 'receipt') return `When did I buy my ${noun}?`;
  if (item.kind === 'warranty') return `Show me the warranty for my ${noun}`;
  if (item.kind === 'bill') return /\bbill\b/i.test(item.title) ? `Show me my ${item.title.toLowerCase()}` : `Show me my ${noun} bill`;
  return null;
}

/** The running stitch that sews a saved paper in. */
function Stitch() {
  return (
    <svg className="stitch" aria-hidden="true">
      <defs>
        <mask id="stitch-reveal">
          <rect className="stitch-draw" pathLength="100" />
        </mask>
      </defs>
      <rect className="stitch-thread" mask="url(#stitch-reveal)" />
    </svg>
  );
}

export function UploadSheet({ job, onClose, onSave, onUndoSave, onAsk, onOpenSaved, onNotSaved }) {
  const [phase, setPhase] = useState('idle'); // preparing | consent | reading | review | saving | saved
  const [prepared, setPrepared] = useState(null);
  const [draft, setDraft] = useState(null); // { kind, title, fields, unsure, source }
  const [reason, setReason] = useState(null);
  const [titleError, setTitleError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedItem, setSavedItem] = useState(null);
  const titleRef = useRef(null);
  const runRef = useRef(0);

  const toReview = (details, why = null, run = runRef.current) => {
    if (run !== runRef.current) return;
    setDraft(details);
    setReason(why);
    setPhase('review');
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  useEffect(() => {
    if (!job) return undefined;
    const run = ++runRef.current;
    setSavedItem(null);
    setSaveError('');
    setTitleError('');
    if (job.sample) {
      const s = sampleUpload();
      setPrepared({ fileName: s.fileName, preview: s.preview, thumb: s.image, mediaType: 'image/svg+xml' });
      setPhase('reading');
      setTimeout(() => toReview({ kind: s.kind, title: s.title, fields: s.fields, unsure: s.unsure, source: 'sample' }, null, run), 1400);
      return undefined;
    }
    setPhase('preparing');
    (async () => {
      const prep = await prepareFile(job.file);
      if (run !== runRef.current) return;
      setPrepared(prep);
      const local = readLocally(prep);
      if (local) return toReview(local, null, run);
      if (!prep.payload) {
        const why = prep.tooBig
          ? { message: 'That file is too big for Weave to read (8 MB at most).', hint: 'You can still type the details.' }
          : prep.text == null && !prep.preview
            ? { message: 'I can’t open this kind of file.', hint: 'Photos, PDFs, calendar files and text notes work best. You can still type the details.' }
            : 'unavailable';
        return toReview(blankDetails(prep), why, run);
      }
      return toReview(blankDetails(prep), {
        message: 'For automatic bill and warranty extraction, open Appliances & Bills.',
        hint: 'You can still save this paper here by entering its details manually.',
      }, run);
    })();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const finish = () => {
    runRef.current += 1;
    setPhase('idle');
    onClose();
  };

  const close = () => {
    if (phase === 'review' || phase === 'consent' || phase === 'reading' || phase === 'preparing') onNotSaved();
    finish();
  };

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value }, unsure: d.unsure.filter((k) => k !== key) }));
  };

  const save = () => {
    const title = (draft.title || suggestTitle(draft.kind, draft.fields)).trim();
    if (!title) {
      setTitleError('Give it a name so you can find it later.');
      titleRef.current?.focus();
      return;
    }
    setPhase('saving');
    const item = {
      id: `paper-${Date.now().toString(36)}`,
      kind: draft.kind,
      title,
      fields: draft.fields,
      image: prepared?.thumb ?? null,
      fileName: prepared?.fileName ?? '',
      source: draft.source,
      sample: draft.source === 'sample',
      savedAt: new Date().toISOString(),
    };
    const result = onSave(item);
    if (!result.ok) {
      setSaveError(`${result.error} Nothing was saved.`);
      setPhase('review');
      return;
    }
    setSavedItem(result.item);
    setPhase('saved');
  };

  const open = Boolean(job) && phase !== 'idle';
  const banner = draft ? bannerFor(draft.source, reason, draft.unsure.length) : null;
  const labels = draft ? FIELD_LABELS[draft.kind] : {};
  const preview = prepared?.preview;

  const title =
    phase === 'saved' ? 'Saved' : phase === 'consent' ? 'Read this photo?' : phase === 'reading' || phase === 'preparing' ? 'Reading it…' : 'Check the details';

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      wide
      footer={
        phase === 'review' || phase === 'saving' ? (
          <>
            <p className="fine">
              <Icon name="i-lock" /> Saved papers stay in this browser.
            </p>
            <div className="row-actions">
              <button className="d-btn is-plain" type="button" onClick={close}>
                Don’t save
              </button>
              <button className="d-btn is-ink" type="button" onClick={save} disabled={phase === 'saving'}>
                <Icon name="i-check" />
                Save it
              </button>
            </div>
          </>
        ) : phase === 'saved' ? (
          <div className="row-actions is-end">
            <button
              className="d-btn is-plain"
              type="button"
              onClick={() => {
                onUndoSave(savedItem.id);
                finish();
              }}
            >
              <Icon name="i-undo" />
              Undo
            </button>
            <button className="d-btn is-line" type="button" onClick={() => { const id = savedItem.id; finish(); onOpenSaved(id); }}>
              Open in Saved
            </button>
            <button className="d-btn is-ink" type="button" onClick={finish}>
              Done
            </button>
          </div>
        ) : null
      }
    >
      <div className={`upload is-${phase}`}>
        {phase !== 'saved' && (
          <figure className="upload-preview">
            {preview ? <img src={preview} alt="The photo you added" /> : <span className="upload-file"><Icon name="i-file" /><span>{prepared?.fileName ?? 'Your file'}</span></span>}
            {preview ? <figcaption>{prepared?.fileName}</figcaption> : null}
            {(phase === 'reading' || phase === 'preparing') && <span className="scan" aria-hidden="true" />}
          </figure>
        )}

        {(phase === 'reading' || phase === 'preparing') && (
          <div className="upload-side" role="status">
            <p className="working-line">
              <span className="working-dots" aria-hidden="true"><i /><i /><i /></span>
              {phase === 'preparing' ? 'Opening your file' : 'Looking for dates, amounts and names'}
            </p>
            <div className="d-skel" aria-hidden="true"><span /><span /><span /></div>
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && draft && (
          <div className="upload-side">
            <p className={`banner is-${banner.tone}`}>
              <Icon name={banner.tone === 'warn' ? 'i-alert' : banner.tone === 'ok' ? 'i-check' : 'i-info'} />
              <span>{banner.text}</span>
            </p>
            {saveError ? (
              <p className="banner is-warn" role="alert">
                <Icon name="i-alert" />
                <span>{saveError}</span>
              </p>
            ) : null}

            <fieldset className="kinds">
              <legend>What is it?</legend>
              <div className="segmented">
                {KIND_ORDER.map((k) => (
                  <label key={k} className={draft.kind === k ? 'is-on' : ''}>
                    <input type="radio" name="kind" value={k} checked={draft.kind === k} onChange={() => setDraft((d) => ({ ...d, kind: k }))} />
                    {KINDS[k].label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="fields">
              <label className={`d-field is-wide${titleError ? ' is-error' : ''}`}>
                <span>Name</span>
                <input
                  ref={titleRef}
                  value={draft.title}
                  placeholder={suggestTitle(draft.kind, draft.fields) || 'For example, Fridge receipt'}
                  onChange={(e) => {
                    setTitleError('');
                    setDraft((d) => ({ ...d, title: e.target.value }));
                  }}
                  aria-invalid={Boolean(titleError)}
                  aria-describedby={titleError ? 'title-error' : undefined}
                />
                {titleError ? <span className="field-error" id="title-error">{titleError}</span> : null}
              </label>
              {KINDS[draft.kind].fields.map((key) => {
                const unsure = draft.unsure.includes(key);
                const wide = key === 'notes' || key === 'item';
                return (
                  <label key={key} className={`d-field${wide ? ' is-wide' : ''}${unsure ? ' is-unsure' : ''}`}>
                    <span>
                      {labels[key]}
                      {key === 'amount' && draft.fields.currency ? ` (${draft.fields.currency})` : ''}
                      {unsure ? <em className="check-this">Check this</em> : null}
                    </span>
                    {key === 'notes' ? (
                      <textarea rows={2} value={draft.fields[key]} onChange={(e) => setField(key, e.target.value)} />
                    ) : (
                      <input
                        type={FIELD_TYPES[key] ?? 'text'}
                        inputMode={key === 'amount' ? 'decimal' : undefined}
                        value={draft.fields[key]}
                        onChange={(e) => setField(key, e.target.value)}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {phase === 'saved' && savedItem && (
          <div className="saved-moment">
            <div className="saved-card">
              <Stitch />
              <span className="saved-thumb" aria-hidden="true">
                {imageFor(savedItem) ? <img src={imageFor(savedItem)} alt="" /> : <Icon name={KINDS[savedItem.kind].icon} />}
              </span>
              <span className="saved-text">
                <strong>{savedItem.title}</strong>
                <span>{summarize(savedItem) || KINDS[savedItem.kind].label}</span>
              </span>
              <span className="saved-knot" aria-hidden="true">
                <Icon name="i-check" />
              </span>
            </div>
            <p className="saved-line" role="status">
              <strong>Saved on this device.</strong> Find it any time under <em>Saved</em> at the top of the page{questionFor(savedItem) ? ', or just ask:' : '.'}
            </p>
            {questionFor(savedItem) && (
              <button
                type="button"
                className="ask-chip is-big"
                onClick={() => {
                  const q = questionFor(savedItem);
                  finish();
                  onAsk(q);
                }}
              >
                {questionFor(savedItem)}
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
