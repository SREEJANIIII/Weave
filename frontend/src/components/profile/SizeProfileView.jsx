import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { OCCASION_SUGGESTIONS } from '../../data/wishlistSample';
import { matchOccasions } from '../../lib/occasionMatcher';
import { recommendSize } from '../../lib/sizeEngine';
import { cmToUnit, unitToCm } from '../../lib/units';

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
  onSaveProfile,
  onClearProfile,
  onUpdateReminderPrefs,
  onAddOccasion,
  onOpenWishlist,
}) {
  const [unit, setUnit] = useState(sizeProfile.unit || 'cm');
  const [fit, setFit] = useState(sizeProfile.fit || 'regular');
  const [masked, setMasked] = useState(Boolean(sizeProfile.masked));
  const [draftValues, setDraftValues] = useState(() => {
    const obj = {};
    for (const f of FIELDS) {
      obj[f.key] = sizeProfile[f.key] ? String(cmToUnit(sizeProfile[f.key], sizeProfile.unit || 'cm')) : '';
    }
    return obj;
  });
  const [savedNote, setSavedNote] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const nextUnit = sizeProfile.unit || 'cm';
    setUnit(nextUnit);
    setFit(sizeProfile.fit || 'regular');
    setMasked(Boolean(sizeProfile.masked));
    const obj = {};
    for (const f of FIELDS) {
      obj[f.key] = sizeProfile[f.key] ? String(cmToUnit(sizeProfile[f.key], nextUnit)) : '';
    }
    setDraftValues(obj);
  }, [sizeProfile]);

  // Add sample occasion inline
  const [evTitle, setEvTitle] = useState('');
  const [evOccasion, setEvOccasion] = useState('Diwali');
  const [evDate, setEvDate] = useState('');

  const matchedCount = useMemo(
    () => wishlist.filter((it) => recommendSize(sizeProfile, it).recommendedSize).length,
    [wishlist, sizeProfile],
  );

  const occasionMatches = useMemo(
    () => matchOccasions(wishlist, occasions, reminderPrefs),
    [wishlist, occasions, reminderPrefs],
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
    });
  };

  const handleSave = (e) => {
    e.preventDefault();
    const next = {
      ...sizeProfile,
      unit,
      fit,
      masked,
    };
    for (const f of FIELDS) {
      next[f.key] = unitToCm(draftValues[f.key], unit);
    }
    onSaveProfile(next);
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 3000);
  };

  const handleToggleMasked = () => {
    const nextMasked = !masked;
    setMasked(nextMasked);
    onSaveProfile({
      ...sizeProfile,
      masked: nextMasked,
    });
  };

  const handleConfirmClear = () => {
    const cleared = {};
    for (const f of FIELDS) cleared[f.key] = '';
    setDraftValues(cleared);
    onClearProfile();
    setConfirmClear(false);
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

  return (
    <div className="sp-page">
      <div className="wl-head">
        <div>
          <div className="wl-head-title-row">
            <h1 className="greeting">My Size Profile</h1>
            {sizeProfile.isSample && <span className="wl-sample-tag">Sample profile measurements</span>}
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
            <strong>Private personal data — stays in your authorised profile</strong>
            <p>
              Measurements are stored locally for this prototype and are never shared with external shopping sites or brand APIs.
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
            <button className="btn btn-link btn-sm" type="button" onClick={() => setConfirmClear(true)}>
              Clear measurements
            </button>
          )}
        </div>
      </section>

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

          <div className="sp-form-foot">
            <button className="btn btn-primary" type="submit">
              <Icon name="i-check" />
              <span>Save profile</span>
            </button>
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
                      </span>
                    </div>
                    <span className={`wl-window-pill${m.inWindow ? '' : ' is-muted'}`}>
                      {m.inWindow ? `${m.triggeredWindow}d window` : 'Outside window'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

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
          </div>
        </section>
      </div>
    </div>
  );
}
