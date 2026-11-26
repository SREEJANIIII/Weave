import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_REMINDER_PREFS,
  DEFAULT_SIZE_PROFILE,
  createSampleOccasionEvents,
  createSampleWishlist,
  normalizeCategoryLabel,
  resolveWishlistImage,
  toBackendCategory,
} from '../data/wishlistSample';
import { mergeBackendSizeMatch } from '../lib/sizeEngine';
import { displayUnit, toBackendUnit } from '../lib/units';

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

async function reqJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function normalizeBackendItem(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    product_id: raw.product_id ?? null,
    name: raw.product_name ?? raw.name ?? 'Saved product',
    brand: raw.brand ?? '',
    category: normalizeCategoryLabel(raw.category),
    rawCategory: raw.category ?? '',
    occasion: raw.occasion ?? '',
    url: raw.product_url ?? raw.url ?? '',
    image: resolveWishlistImage(raw),
    rawImage: raw.image_url ?? raw.image ?? '',
    notes: raw.notes ?? '',
    description: raw.description ?? '',
    price: raw.price ?? null,
    status: raw.status ?? 'saved',
    source: raw.source ?? 'sample data',
    savedAt: (raw.created_at ? String(raw.created_at).slice(0, 10) : raw.savedAt) || new Date().toISOString().slice(0, 10),
    isSample: raw.source === 'sample data',
  };
}

function toBackendImageUrl(img) {
  if (!img) return undefined;
  if (/^https?:\/\//i.test(img)) return img;
  if (typeof window !== 'undefined' && img.startsWith('/')) return `${window.location.origin}${img}`;
  return undefined;
}

function normalizeBackendProfile(raw, encryptedFlag, prevMasked = false) {
  if (!raw) return null;
  const m = raw.measurements ?? {};
  return {
    id: raw.id ?? 'profile_primary',
    bust: m.bust ?? null,
    waist: m.waist ?? null,
    hips: m.hips ?? null,
    shoulder: m.shoulder ?? null,
    inseam: m.inseam ?? null,
    height: m.height ?? null,
    fit: raw.preferred_fit ?? 'regular',
    unit: displayUnit(raw.unit || 'cm'),
    preferredCategories: (raw.preferred_categories ?? []).map(normalizeCategoryLabel),
    masked: prevMasked,
    encrypted: Boolean(encryptedFlag ?? raw.encrypted),
    deleted: false,
    isSample: /sample/i.test(raw.source || ''),
    privacyNote: raw.privacy || '',
  };
}

export function useWishlistStore({ backendOnline = false, wishlistEnabled = false, calendarEnabled = false } = {}) {
  const [wishlist, setWishlist] = useState(() => loadJson(KEYS.wishlist, createSampleWishlist));
  const [sizeProfile, setSizeProfile] = useState(() => loadJson(KEYS.profile, () => ({ ...DEFAULT_SIZE_PROFILE })));
  const [reminderPrefs, setReminderPrefs] = useState(() =>
    loadJson(KEYS.reminders, () => ({ ...DEFAULT_REMINDER_PREFS })),
  );
  const [occasions, setOccasions] = useState(() => loadJson(KEYS.occasions, createSampleOccasionEvents));
  const [backendReminders, setBackendReminders] = useState([]);
  const [profileDeleted, setProfileDeleted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const syncMode = !backendOnline ? 'local' : wishlistEnabled ? 'backend' : 'disabled';

  useEffect(() => {
    if (syncMode === 'local') {
      try {
        localStorage.setItem(KEYS.wishlist, JSON.stringify(wishlist));
      } catch {}
    }
  }, [wishlist, syncMode]);

  useEffect(() => {
    if (syncMode === 'local') {
      try {
        localStorage.setItem(KEYS.profile, JSON.stringify(sizeProfile));
      } catch {}
    }
  }, [sizeProfile, syncMode]);

  useEffect(() => {
    try {
      localStorage.setItem(KEYS.reminders, JSON.stringify(reminderPrefs));
    } catch {}
  }, [reminderPrefs]);

  useEffect(() => {
    if (syncMode === 'local') {
      try {
        localStorage.setItem(KEYS.occasions, JSON.stringify(occasions));
      } catch {}
    }
  }, [occasions, syncMode]);

  const refreshAll = useCallback(async () => {
    if (syncMode !== 'backend') return;
    setSyncing(true);
    setSyncError(null);
    try {
      const requests = [
        reqJson('/api/wishlist?status=all'),
        reqJson('/api/size-profile'),
        reqJson('/api/reminders'),
      ];
      if (calendarEnabled) requests.push(reqJson('/api/calendar/events'));
      const [wRes, pRes, rRes, cRes] = await Promise.all(requests);

      if (wRes.ok && Array.isArray(wRes.data?.items)) {
        setWishlist(wRes.data.items.map(normalizeBackendItem));
      }
      if (pRes.ok) {
        if (pRes.data?.status === 'unavailable' || !pRes.data?.profile) {
          setProfileDeleted(true);
          setSizeProfile((prev) => ({
            ...prev,
            bust: null,
            waist: null,
            hips: null,
            shoulder: null,
            inseam: null,
            height: null,
            encrypted: Boolean(pRes.data?.encrypted),
            deleted: true,
            isSample: false,
          }));
        } else {
          setProfileDeleted(false);
          setSizeProfile((prev) => normalizeBackendProfile(pRes.data.profile, pRes.data.encrypted, prev.masked));
        }
      }
      if (rRes.ok && Array.isArray(rRes.data?.reminders)) {
        setBackendReminders(rRes.data.reminders);
      }
      if (cRes?.ok && Array.isArray(cRes.data?.events)) {
        const mapped = cRes.data.events
          .filter((e) => e.occasion || /diwali|wedding|birthday|party|festival|vacation/i.test(e.title))
          .map((e) => ({
            id: e.id,
            title: e.title,
            occasion: e.occasion || (/birthday/i.test(e.title) ? 'Birthday' : 'Occasion'),
            date: e.date,
            location: e.location || '',
            source: 'Backend Calendar',
          }));
        setOccasions(mapped);
      }
    } catch (err) {
      setSyncError(err?.message || 'Failed to sync wishlist data from backend.');
    } finally {
      setSyncing(false);
    }
  }, [syncMode, calendarEnabled]);

  useEffect(() => {
    if (syncMode === 'backend') {
      refreshAll();
    } else if (syncMode === 'local') {
      setWishlist(loadJson(KEYS.wishlist, createSampleWishlist));
      setSizeProfile(loadJson(KEYS.profile, () => ({ ...DEFAULT_SIZE_PROFILE })));
      setOccasions(loadJson(KEYS.occasions, createSampleOccasionEvents));
      setBackendReminders([]);
      setProfileDeleted(false);
    }
  }, [syncMode, refreshAll]);

  const addItem = useCallback(
    async (item) => {
      if (syncMode === 'backend') {
        const payload = {
          product_name: item.name,
          brand: item.brand,
          product_url: item.url,
          category: toBackendCategory(item.category),
          occasion: item.occasion || undefined,
          notes: item.notes || undefined,
          description: item.description || undefined,
          price: item.price !== undefined && item.price !== '' && item.price !== null ? Number(item.price) : undefined,
          image_url: toBackendImageUrl(item.image),
        };
        const r = await reqJson('/api/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!r.ok) return { ok: false, error: r.data?.error || 'Could not save wishlist item.' };
        const normalized = normalizeBackendItem(r.data.item);
        setWishlist((prev) => [normalized, ...prev]);
        return { ok: true, item: normalized };
      }

      const created = {
        ...item,
        id: `wl_${Date.now().toString(36)}`,
        status: item.status || 'saved',
        savedAt: new Date().toISOString().slice(0, 10),
        isSample: false,
      };
      setWishlist((prev) => [created, ...prev]);
      return { ok: true, item: created };
    },
    [syncMode],
  );

  const updateItem = useCallback(
    async (id, patch) => {
      if (syncMode === 'backend') {
        const body = {};
        if (patch.name !== undefined) body.product_name = patch.name;
        if (patch.brand !== undefined) body.brand = patch.brand;
        if (patch.url !== undefined && patch.url !== '') body.product_url = patch.url;
        if (patch.category !== undefined) body.category = toBackendCategory(patch.category);
        if (patch.occasion !== undefined) body.occasion = patch.occasion;
        if (patch.notes !== undefined) body.notes = patch.notes;
        if (patch.description !== undefined) body.description = patch.description;
        if (patch.price !== undefined) body.price = patch.price === '' || patch.price === null ? undefined : Number(patch.price);
        if (patch.status !== undefined) body.status = patch.status;
        if (patch.image !== undefined) {
          const img = toBackendImageUrl(patch.image);
          if (img) body.image_url = img;
        }
        const r = await reqJson(`/api/wishlist/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) return { ok: false, error: r.data?.error || 'Could not update item.' };
        const normalized = normalizeBackendItem(r.data.item);
        setWishlist((prev) => prev.map((it) => (it.id === id ? normalized : it)));
        return { ok: true, item: normalized };
      }

      setWishlist((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
      return { ok: true };
    },
    [syncMode],
  );

  const removeItem = useCallback(
    async (id) => {
      if (syncMode === 'backend') {
        const r = await reqJson(`/api/wishlist/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!r.ok) return { ok: false, error: r.data?.error || 'Could not remove item.' };
      }
      setWishlist((prev) => prev.filter((it) => it.id !== id));
      return { ok: true };
    },
    [syncMode],
  );

  const saveProfile = useCallback(
    async (nextProfile) => {
      if (syncMode === 'backend') {
        const payload = {
          unit: toBackendUnit(nextProfile.unit || 'cm'),
          preferred_fit: nextProfile.fit || 'regular',
          preferred_categories: (nextProfile.preferredCategories ?? []).map(toBackendCategory),
        };
        for (const k of ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height']) {
          payload[k] = nextProfile[k] !== null && nextProfile[k] !== undefined && Number(nextProfile[k]) > 0
            ? Number(nextProfile[k])
            : null;
        }
        const r = await reqJson('/api/size-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!r.ok) return { ok: false, error: r.data?.error || 'Could not save size profile.' };
        setProfileDeleted(false);
        setSizeProfile({ ...nextProfile, deleted: false, isSample: false, encrypted: Boolean(r.data?.profile?.encrypted ?? nextProfile.encrypted) });
        return { ok: true };
      }

      setProfileDeleted(false);
      setSizeProfile({ ...nextProfile, isSample: false });
      return { ok: true };
    },
    [syncMode],
  );

  const clearProfileMeasurements = useCallback(async () => {
    if (syncMode === 'backend') {
      const r = await reqJson('/api/size-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bust: null, waist: null, hips: null, shoulder: null, inseam: null, height: null }),
      });
      if (!r.ok) return { ok: false, error: r.data?.error || 'Could not clear measurements.' };
    }
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
    return { ok: true };
  }, [syncMode]);

  const deleteProfile = useCallback(async () => {
    if (syncMode === 'backend') {
      const r = await reqJson('/api/size-profile', { method: 'DELETE' });
      if (!r.ok) return { ok: false, error: r.data?.error || 'Could not delete size profile.' };
    }
    setProfileDeleted(true);
    setSizeProfile((prev) => ({
      ...prev,
      bust: null,
      waist: null,
      hips: null,
      shoulder: null,
      inseam: null,
      height: null,
      deleted: true,
      isSample: false,
    }));
    return { ok: true };
  }, [syncMode]);

  const matchSizeForProduct = useCallback(
    async (item) => {
      if (syncMode !== 'backend') return mergeBackendSizeMatch(sizeProfile, item, null);
      const r = await reqJson('/api/size-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          brand: item.brand,
          category: item.rawCategory || toBackendCategory(item.category),
        }),
      });
      if (!r.ok) return mergeBackendSizeMatch(sizeProfile, item, null);
      return mergeBackendSizeMatch(sizeProfile, item, r.data);
    },
    [syncMode, sizeProfile],
  );

  const updateReminderPrefs = useCallback((patch) => {
    setReminderPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const reconcileReminders = useCallback(async () => {
    if (syncMode !== 'backend' || !calendarEnabled) return { ok: false, error: 'Backend Wishlist & Calendar must both be connected.' };
    const windows = (reminderPrefs.leadDays ?? [30, 14, 7]).filter((w) => [30, 14, 7].includes(w));
    const r = await reqJson('/api/reminders/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ windows: windows.length ? windows : [30, 14, 7] }),
    });
    if (!r.ok) return { ok: false, error: r.data?.error || 'Could not reconcile reminders.' };
    const listRes = await reqJson('/api/reminders');
    if (listRes.ok && Array.isArray(listRes.data?.reminders)) {
      setBackendReminders(listRes.data.reminders);
    }
    return { ok: true, count: r.data?.count ?? 0 };
  }, [syncMode, calendarEnabled, reminderPrefs.leadDays]);

  const dismissReminder = useCallback(
    async (eventId, backendReminderIds = []) => {
      if (syncMode === 'backend' && backendReminderIds.length > 0) {
        await Promise.all(
          backendReminderIds.map((rid) =>
            reqJson(`/api/reminders/${encodeURIComponent(rid)}/dismiss`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }),
          ),
        );
        const listRes = await reqJson('/api/reminders');
        if (listRes.ok && Array.isArray(listRes.data?.reminders)) {
          setBackendReminders(listRes.data.reminders);
        }
      }
      setReminderPrefs((prev) => ({
        ...prev,
        dismissedIds: prev.dismissedIds.includes(eventId)
          ? prev.dismissedIds
          : [...prev.dismissedIds, eventId],
      }));
    },
    [syncMode],
  );

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
    setBackendReminders([]);
    setProfileDeleted(false);
  }, []);

  return {
    syncMode,
    syncing,
    syncError,
    profileDeleted,
    wishlist,
    sizeProfile,
    reminderPrefs,
    backendReminders,
    occasions,
    refreshAll,
    addItem,
    updateItem,
    removeItem,
    saveProfile,
    clearProfileMeasurements,
    deleteProfile,
    matchSizeForProduct,
    updateReminderPrefs,
    reconcileReminders,
    dismissReminder,
    approveReminderEvent,
    addOccasionEvent,
    resetWishlistDemo,
  };
}
