import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { createSampleSaved } from '../lib/savedPapers';

// Saved papers live in MongoDB (/api/papers), with the text read from each one. A copy is kept in
// this browser so the list shows instantly and still works if the server is out of reach.
// Every save is read back (by the server, or from browser storage) before the interface says "Saved".
const KEY = 'weave:saved:v1';
const MOVED = 'weave:saved:moved-to-server:v1';

const withoutBytes = (items) => items.map(({ original, ...rest }) => rest);

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to samples
  }
  return createSampleSaved();
}

function cache(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(withoutBytes(items)));
  } catch {
    // The cache is only a convenience; the server copy is what counts.
  }
}

/** Browser-only save, used when the server can't be reached. */
function writeLocal(list, { mustHave, mustNotHave } = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(withoutBytes(list)));
    const back = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (mustHave && !back.some((it) => it.id === mustHave)) return { ok: false, error: 'It didn’t stick when Weave checked.' };
    if (mustNotHave && back.some((it) => it.id === mustNotHave)) return { ok: false, error: 'It’s still there when Weave checked.' };
    return { ok: true };
  } catch (err) {
    const full = err?.name === 'QuotaExceededError' || /quota/i.test(err?.message ?? '');
    return { ok: false, error: full ? 'This browser is out of room for saved papers.' : 'This browser wouldn’t let Weave save it.' };
  }
}

export function useSavedPapers() {
  const [saved, setSaved] = useState(loadLocal);
  const [onServer, setOnServer] = useState(false);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const show = useCallback((items) => {
    setSaved(items);
    cache(items);
  }, []);

  useEffect(() => {
    (async () => {
      const r = await api('/api/papers');
      if (!r.ok) return; // keep the browser copy
      let items = r.data.items ?? [];
      if (!localStorage.getItem(MOVED)) {
        // First run against the database: move papers kept in this browser up to it.
        const moved = await api('/api/papers/import', { items: loadLocal() });
        if (moved.ok) items = moved.data.items;
        try {
          localStorage.setItem(MOVED, '1');
        } catch {
          // it will try again next time, and only adds papers that are missing
        }
      }
      setOnServer(true);
      show(items);
    })();
  }, [show]);

  /** Returns { ok, item } only after the item has been read back. */
  const add = useCallback(
    async (item) => {
      if (onServer) {
        const r = await api('/api/papers', { item });
        if (!r.ok) return { ok: false, error: r.data?.error ?? 'The server wouldn’t save it.' };
        show([r.data.item, ...savedRef.current.filter((it) => it.id !== item.id)]);
        return { ok: true, item: r.data.item };
      }
      const next = [item, ...savedRef.current.filter((it) => it.id !== item.id)];
      const result = writeLocal(next, { mustHave: item.id });
      if (result.ok) setSaved(withoutBytes(next));
      return { ...result, item };
    },
    [onServer, show],
  );

  const remove = useCallback(
    async (id) => {
      const item = savedRef.current.find((it) => it.id === id);
      const rest = savedRef.current.filter((it) => it.id !== id);
      if (onServer) {
        let ok = false;
        try {
          ok = (await fetch(`/api/papers/${encodeURIComponent(id)}`, { method: 'DELETE' })).ok;
        } catch {
          ok = false;
        }
        if (!ok) return { ok: false, error: 'The server wouldn’t delete it.', item };
        show(rest);
        return { ok: true, item };
      }
      const result = writeLocal(rest, { mustNotHave: id });
      if (result.ok) setSaved(rest);
      return { ...result, item };
    },
    [onServer, show],
  );

  /** Read (or re-read) the full text of a stored photo or PDF on the server. */
  const readText = useCallback(
    async (id) => {
      const r = await api(`/api/papers/${encodeURIComponent(id)}/read`, {});
      if (!r.ok) return { ok: false, error: r.data?.error ?? 'Reading failed.' };
      show(savedRef.current.map((it) => (it.id === id ? r.data.item : it)));
      return { ok: true, item: r.data.item };
    },
    [show],
  );

  const restoreSamples = useCallback(async () => {
    const samples = createSampleSaved();
    if (onServer) {
      const r = await api('/api/papers/reset', { items: samples });
      if (r.ok) show(r.data.items);
      return { ok: r.ok };
    }
    const result = writeLocal(samples);
    if (result.ok) setSaved(samples);
    return result;
  }, [onServer, show]);

  return { saved, onServer, add, remove, readText, restoreSamples };
}
