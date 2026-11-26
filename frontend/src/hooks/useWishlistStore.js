import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_REMINDER_PREFS,
  DEFAULT_SIZE_PROFILE,
  createSampleOccasionEvents,
  createSampleWishlist,
} from '../data/wishlistSample';

const KEYS = {
  wishlist: 'weave:wishlist:v1',
  profile: 'weave:size-profile:v1',
  reminders: 'weave:reminder-prefs:v1',
  occasions: 'weave:occasions:v1',
};

function loadJson(key, fallbackFn) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore storage errors
  }
  return fallbackFn();
}

export function useWishlistStore() {
  const [wishlist, setWishlist] = useState(() => loadJson(KEYS.wishlist, createSampleWishlist));
  const [sizeProfile, setSizeProfile] = useState(() => loadJson(KEYS.profile, () => ({ ...DEFAULT_SIZE_PROFILE })));
  const [reminderPrefs, setReminderPrefs] = useState(() =>
    loadJson(KEYS.reminders, () => ({ ...DEFAULT_REMINDER_PREFS })),
  );
  const [occasions, setOccasions] = useState(() => loadJson(KEYS.occasions, createSampleOccasionEvents));

  useEffect(() => {
    try {
      localStorage.setItem(KEYS.wishlist, JSON.stringify(wishlist));
    } catch {}
  }, [wishlist]);

  useEffect(() => {
    try {
      localStorage.setItem(KEYS.profile, JSON.stringify(sizeProfile));
    } catch {}
  }, [sizeProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(KEYS.reminders, JSON.stringify(reminderPrefs));
    } catch {}
  }, [reminderPrefs]);

  useEffect(() => {
    try {
      localStorage.setItem(KEYS.occasions, JSON.stringify(occasions));
    } catch {}
  }, [occasions]);

  const addItem = useCallback((item) => {
    const created = {
      ...item,
      id: `wl_${Date.now().toString(36)}`,
      savedAt: new Date().toISOString().slice(0, 10),
      isSample: false,
    };
    setWishlist((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateItem = useCallback((id, patch) => {
    setWishlist((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id) => {
    setWishlist((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const saveProfile = useCallback((nextProfile) => {
    setSizeProfile({ ...nextProfile, isSample: false });
  }, []);

  const clearProfileMeasurements = useCallback(() => {
    setSizeProfile((prev) => ({
      ...prev,
      bust: null,
      waist: null,
      hips: null,
      shoulder: null,
      inseam: null,
      height: null,
      isSample: false,
    }));
  }, []);

  const updateReminderPrefs = useCallback((patch) => {
    setReminderPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const dismissReminder = useCallback((eventId) => {
    setReminderPrefs((prev) => ({
      ...prev,
      dismissedIds: prev.dismissedIds.includes(eventId)
        ? prev.dismissedIds
        : [...prev.dismissedIds, eventId],
    }));
  }, []);

  const approveReminderEvent = useCallback((eventId) => {
    setReminderPrefs((prev) => ({
      ...prev,
      approvedEventIds: prev.approvedEventIds.includes(eventId)
        ? prev.approvedEventIds
        : [...prev.approvedEventIds, eventId],
    }));
  }, []);

  const addOccasionEvent = useCallback((ev) => {
    const created = {
      ...ev,
      id: `occ_${Date.now().toString(36)}`,
      source: 'Added in prototype',
    };
    setOccasions((prev) => [...prev, created]);
    return created;
  }, []);

  const resetWishlistDemo = useCallback(() => {
    setWishlist(createSampleWishlist());
    setSizeProfile({ ...DEFAULT_SIZE_PROFILE });
    setReminderPrefs({ ...DEFAULT_REMINDER_PREFS });
    setOccasions(createSampleOccasionEvents());
  }, []);

  return {
    wishlist,
    sizeProfile,
    reminderPrefs,
    occasions,
    addItem,
    updateItem,
    removeItem,
    saveProfile,
    clearProfileMeasurements,
    updateReminderPrefs,
    dismissReminder,
    approveReminderEvent,
    addOccasionEvent,
    resetWishlistDemo,
  };
}

