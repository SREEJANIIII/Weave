import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { CATEGORIES, OCCASION_SUGGESTIONS } from '../../data/wishlistSample';
import { matchOccasions } from '../../lib/occasionMatcher';
import { recommendSize } from '../../lib/sizeEngine';
import { cmToUnit, displayUnit, unitToCm } from '../../lib/units';

const FIELDS = [
  { key: 'bust', label: 'Bust', hint: 'Fullest part of chest' },
  { key: 'waist', label: 'Waist', hint: 'Natural waistline' },
  { key: 'hips', label: 'Hips', hint: 'Fullest part of hips' },
  { key: 'shoulder', label: 'Shoulder', hint: 'Across shoulder seam to seam' },
  { key: 'inseam', label: 'Inseam', hint: 'Inner leg to ankle' },
  { key: 'height', label: 'Height (optional)', hint: 'Used for drape context' },
];

const FIT_OPTIONS = [
  { id: 'slim', label: 'Slim', desc: 'Prefers closer tailoring on borderline sizes' },
  { id: 'regular', label: 'Regular', desc: 'Balanced everyday ease' },
  { id: 'oversized', label: 'Oversized', desc: 'Biases toward extra room or sizing up' },
];

const STANDARD_WINDOWS = [30, 14, 7];

export function SizeProfileView({
  sizeProfile,
  wishlist,
  occasions,
  reminderPrefs,
  backendReminders = [],
  syncMode = 'local',
  calendarEnabled = false,
  profileDeleted = false,
  serverToday,
  onSaveProfile,
  onClearProfile,
  onDeleteProfile,
  onUpdateReminderPrefs,
  onReconcileReminders,
  onAddOccasion,
  onOpenWishlist,
}) {
  const [unit, setUnit] = useState(displayUnit(sizeProfile.unit || 'cm'));
  const [fit, setFit] = useState(sizeProfile.fit || 'regular');
  const [preferredCategories, setPreferredCategories] = useState(sizeProfile.preferredCategories ?? ['Dresses', 'Tops']);
  const [masked, setMasked] = useState(Boolean(sizeProfile.masked));
  const [draftValues, setDraftValues] = useState(() => {
    const obj = {};
    const u = displayUnit(sizeProfile.unit || 'cm');
    for (const f of FIELDS) {
      obj[f.key] = sizeProfile[f.key] ? String(cmToUnit(sizeProfile[f.key], u)) : '';
    }
    return obj;
  });
  const [savedNote, setSavedNote] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    const nextUnit = displayUnit(sizeProfile.unit || 'cm');
    setUnit(nextUnit);
    setFit(sizeProfile.fit || 'regular');
    setPreferredCategories(sizeProfile.preferredCategories ?? ['Dresses', 'Tops']);
    setMasked(Boolean(sizeProfile.masked));
    const obj = {};
    for (const f of FIELDS) {
      obj[f.key] = sizeProfile[f.key] ? String(cmToUnit(sizeProfile[f.key], nextUnit)) : '';
    }
    setDraftValues(obj);
  }, [sizeProfile]);

  // Add sample occasion inline (offline mode)
  const [evTitle, setEvTitle] = useState('');
  const [evOccasion, setEvOccasion] = useState('Diwali');
  const [evDate, setEvDate] = useState('');

  const matchedCount = useMemo(
    () => wishlist.filter((it) => recommendSize(sizeProfile, it).recommendedSize).length,
    [wishlist, sizeProfile],
  );

  const occasionMatches = useMemo(
    () => matchOccasions(wishlist, occasions, reminderPrefs, serverToday, backendReminders),
    [wishlist, occasions, reminderPrefs, serverToday, backendReminders],
  );

  const switchUnit = (nextUnit) => {
    if (nextUnit === unit) return;
    const converted = {};
    for (const f of FIELDS) {
      const canonical = unitToCm(draftValues[f.key], unit);
      converted[f.key] = canonical ? String(cmToUnit(canonical, nextUnit)) : '';
    }
    setDraftValues(converted);
    setUnit(nextUnit);
    onSaveProfile({
      ...sizeProfile,
      unit: nextUnit,
      fit,
      preferredCategories,
      masked,
    });
  };

  const toggleCategory = (cat) => {
    setPreferredCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    const next = {
      ...sizeProfile,
      unit,
      fit,
      preferredCategories,
      masked,
    };
    for (const f of FIELDS) {
      next[f.key] = unitToCm(draftValues[f.key], unit);
    }
    const res = await onSaveProfile(next);
    setSaving(false);
    if (res && res.ok === false) {
      setSaveError(res.error || 'Could not save size profile.');
    } else {
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 3000);
    }
  };

  const handleToggleMasked = () => {
    const nextMasked = !masked;
    setMasked(nextMasked);
    onSaveProfile({
      ...sizeProfile,
      masked: nextMasked,
    });
  };

  const handleConfirmClear = async () => {
    const cleared = {};
    for (const f of FIELDS) cleared[f.key] = '';
    setDraftValues(cleared);
    await onClearProfile();
    setConfirmClear(false);
  };

  const handleConfirmDelete = async () => {
    const cleared = {};
    for (const f of FIELDS) cleared[f.key] = '';
    setDraftValues(cleared);
    await onDeleteProfile?.();
    setConfirmDelete(false);
  };

  const toggleLeadDay = (d) => {
    const current = new Set(reminderPrefs.leadDays ?? []);
    if (current.has(d)) current.delete(d);
    else current.add(d);
    onUpdateReminderPrefs({ leadDays: [...current].sort((a, b) => b - a) });
  };

  const handleAddOccasion = (e) => {
    e.preventDefault();
    if (!evTitle.trim() || !evDate) return;
    onAddOccasion({
      title: evTitle.trim(),
      occasion: evOccasion.trim() || 'Casual',
      date: evDate,
      location: 'Added to Calendar',
    });
    setEvTitle('');
    setEvDate('');
  };

  const encryptionLabel =
    syncMode === 'backend'
      ? sizeProfile.encrypted
        ? 'AES-256-GCM encrypted in MongoDB — private to your profile'
        : 'Stored in MongoDB (set WEAVE_PROFILE_ENCRYPTION_KEY in backend/.env to encrypt at rest)'
      : 'Private personal data — stays in your local browser profile';

  return (
    <div className="sp-page">
      <div className="wl-head">
        <div>
          <div className="wl-head-title-row">
            <h1 className="greeting">My Size Profile</h1>
            {syncMode === 'backend' ? (
              <span className="wl-sample-tag">
                {sizeProfile.encrypted ? 'MongoDB · Encrypted' : 'MongoDB'}
              </span>
            ) : (
              sizeProfile.isSample && <span className="wl-sample-tag">Sample profile measurements</span>
            )}
          </div>
          <p className="ask-sub">
            Private measurements used only inside your Weave profile to compare against brand-specific size charts.
          </p>
        </div>
        <button className="btn btn-quiet" type="button" onClick={onOpenWishlist}>
          <Icon name="i-heart" />
          <span>Back to Wishlist</span>
        </button>
      </div>

      {/* Privacy notice & controls */}
      <section className="sp-privacy-banner" aria-label="Profile privacy controls">
        <div className="sp-privacy-copy">
          <Icon name="i-shield" />
          <div>
            <strong>{encryptionLabel}</strong>
            <p>
              Sensitive measurements are redacted from Weave&rsquo;s MCP activity logs and SSE traces, and are never sent to external stores.
            </p>
          </div>
        </div>
        <div className="sp-privacy-actions">
          <button className="btn btn-quiet btn-sm" type="button" onClick={handleToggleMasked}>
            <Icon name={masked ? 'i-eye' : 'i-eye-off'} />
            <span>{masked ? 'Show values' : 'Hide values'}</span>
          </button>
          {confirmClear ? (
            <div className="wl-confirm-del">
              <button className="btn btn-primary btn-sm" type="button" onClick={handleConfirmClear}>
                Confirm clear
              </button>
              <button className="btn btn-link btn-sm" type="button" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-link btn-sm"
              type="button"
              disabled={syncMode === 'disabled'}
              onClick={() => {
                setConfirmDelete(false);
                setConfirmClear(true);
              }}
            >
              Clear measurements
            </button>
          )}
          {syncMode === 'backend' && onDeleteProfile && (
            confirmDelete ? (
              <div className="wl-confirm-del">
                <button className="btn btn-primary btn-sm" type="button" onClick={handleConfirmDelete}>
                  Delete stored profile
                </button>
                <button className="btn btn-link btn-sm" type="button" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-link btn-sm"
                type="button"
                disabled={profileDeleted}
                onClick={() => {
                  setConfirmClear(false);
                  setConfirmDelete(true);
                }}
              >
                Delete profile
              </button>
            )
          )}
        </div>
      </section>

      {profileDeleted && (
        <div className="notice" role="status">
          <Icon name="i-alert" />
          <div>
            <strong>Stored size profile was deleted.</strong>
            <p>Enter measurements below and click Save profile to create a new private profile.</p>
          </div>
        </div>
      )}

      <div className="sp-grid">
        {/* Left: Measurements Form */}
        <form className="sp-card" onSubmit={handleSave}>
          <div className="sp-card-head">
            <div>
              <h2>Body measurements</h2>
              <p className="panel-note">
                Currently matching <strong>{matchedCount}</strong> of {wishlist.length} wishlist items.
              </p>
            </div>
            <div className="planner" role="radiogroup" aria-label="Measurement unit">
              {['cm', 'in'].map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={String(unit === u)}
                  disabled={syncMode === 'disabled'}
                  onClick={() => switchUnit(u)}
                >
                  {u === 'cm' ? 'cm' : 'inches'}
                </button>
              ))}
            </div>
          </div>

          <div className="sp-fields">
            {FIELDS.map((f) => (
              <div key={f.key} className="field">
                <label htmlFor={`sp-${f.key}`}>
                  {f.label} <small>({unit})</small>
                </label>
                <input
                  id={`sp-${f.key}`}
                  type={masked ? 'password' : 'number'}
                  step="0.1"
                  min="1"
                  max="300"
                  disabled={syncMode === 'disabled'}
                  placeholder={unit === 'cm' ? 'cm' : 'inches'}
                  value={draftValues[f.key]}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
                <span className="sp-hint">{f.hint}</span>
              </div>
            ))}
          </div>

          <div className="sp-fit-section">
            <span className="sp-fit-title">Preferred fit</span>
            <div className="sp-fit-options" role="radiogroup" aria-label="Preferred fit">
              {FIT_OPTIONS.map((o) => {
                const on = fit === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={String(on)}
                    disabled={syncMode === 'disabled'}
                    className={`sp-fit-card${on ? ' is-on' : ''}`}
                    onClick={() => setFit(o.id)}
                  >
                    <strong>{o.label}</strong>
                    <span>{o.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sp-fit-section">
            <span className="sp-fit-title">Preferred categories</span>
            <div className="wl-filter-group" role="group" aria-label="Preferred garment categories">
              {CATEGORIES.map((cat) => {
                const active = preferredCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`wl-pill-btn${active ? ' is-on' : ''}`}
                    disabled={syncMode === 'disabled'}
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sp-form-foot">
            <button className="btn btn-primary" type="submit" disabled={saving || syncMode === 'disabled'}>
              <Icon name="i-check" />
              <span>{saving ? 'Saving...' : 'Save profile'}</span>
            </button>
            {saveError && (
              <span className="field-error" role="alert">{saveError}</span>
            )}
            {savedNote && (
              <span className="sp-saved-msg" role="status">
                Saved — size recommendations updated.
              </span>
            )}
          </div>
        </form>

        {/* Right: Occasion Reminder Preferences & Calendar Matches */}
        <section className="sp-card" aria-labelledby="sp-rem-title">
          <div className="sp-card-head">
            <div>
              <h2 id="sp-rem-title">Occasion reminder timing</h2>
              <p className="panel-note">Choose when Weave surfaces matching wishlist items before a calendar event.</p>
            </div>
            {syncMode === 'backend' && calendarEnabled && onReconcileReminders && (
              <button
                className="btn btn-quiet btn-sm"
                type="button"
                disabled={reconciling}
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
          </div>

          <div className="sp-lead-list">
            {STANDARD_WINDOWS.map((d) => {
              const checked = (reminderPrefs.leadDays ?? []).includes(d);
              return (
                <label key={d} className="sp-check-row">
                  <input type="checkbox" checked={checked} onChange={() => toggleLeadDay(d)} />
                  <span>{d} days before the occasion</span>
                </label>
              );
            })}
            <label className="sp-custom-days">
              <span>Custom lead time (days)</span>
              <input
                type="number"
                min="1"
                max="90"
                placeholder="e.g. 45"
                value={reminderPrefs.customDays ?? ''}
                onChange={(e) =>
                  onUpdateReminderPrefs({
                    customDays: e.target.value ? Math.min(90, Math.max(1, Number(e.target.value))) : null,
                  })
                }
              />
            </label>
          </div>

          <div className="sp-occ-preview">
            <h3>Matched calendar occasions ({occasionMatches.length})</h3>
            {occasionMatches.length === 0 ? (
              <p className="panel-note">No upcoming calendar events match your wishlist tags yet.</p>
            ) : (
              <ul className="sp-occ-list">
                {occasionMatches.map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.event.title}</strong>
                      <span>
                        {m.event.date} · in {m.daysUntil} days · {m.items.length} saved{' '}
                        {m.items.length === 1 ? 'item' : 'items'}
                        {m.backendStatus ? ` · DB: ${m.backendStatus}` : ''}
                      </span>
                    </div>
                    <span className={`wl-window-pill${m.inWindow ? '' : ' is-muted'}`}>
                      {m.inWindow ? `${m.triggeredWindow}d window` : 'Outside window'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {syncMode !== 'backend' && (
              <form className="sp-add-occ" onSubmit={handleAddOccasion}>
                <h3>Test with a sample calendar occasion</h3>
                <div className="sp-add-occ-row">
                  <input
                    type="text"
                    placeholder="Event (e.g. Sister's wedding)"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                  />
                  <select value={evOccasion} onChange={(e) => setEvOccasion(e.target.value)}>
                    {OCCASION_SUGGESTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
                  <button className="btn btn-quiet btn-sm" type="submit">
                    Add event
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
