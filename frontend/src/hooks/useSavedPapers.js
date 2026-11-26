import { useCallback, useState } from 'react';
import { createSampleSaved } from '../lib/savedPapers';

// Saved papers live in this browser's storage. Every write is read back before the interface says "Saved".
const KEY = 'weave:saved:v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to samples
  }
  const samples = createSampleSaved();
  try {
    localStorage.setItem(KEY, JSON.stringify(samples));
  } catch {
    // samples still show for this visit
  }
  return samples;
}

/** Write the whole list, then read it back and check `mustHave` is really there (or really gone). */
function writeAndVerify(list, { mustHave, mustNotHave } = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    const back = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (mustHave && !back.some((it) => it.id === mustHave)) return { ok: false, error: 'It didn’t stick when Weave checked.' };
    if (mustNotHave && back.some((it) => it.id === mustNotHave)) return { ok: false, error: 'It’s still there when Weave checked.' };
    return { ok: true };
  } catch (err) {
    const full = err?.name === 'QuotaExceededError' || /quota/i.test(err?.message ?? '');
    return { ok: false, full, error: full ? 'This browser is out of room for saved papers.' : 'This browser wouldn’t let Weave save it.' };
  }
}

export function useSavedPapers() {
  const [saved, setSaved] = useState(load);

  /** Returns { ok, item } only after the item has been read back from storage. */
  const add = useCallback(
    (item) => {
      const next = [item, ...saved.filter((it) => it.id !== item.id)];
      let result = writeAndVerify(next, { mustHave: item.id });
      let stored = item;
      if (!result.ok && result.full && item.image && !String(item.image).startsWith('sample:')) {
        // Try again without the photo so the details are not lost.
        stored = { ...item, image: null, imageDropped: true };
        result = writeAndVerify([stored, ...saved.filter((it) => it.id !== item.id)], { mustHave: item.id });
      }
      if (result.ok) setSaved(JSON.parse(localStorage.getItem(KEY)));
      return { ...result, item: stored };
    },
    [saved],
  );

  const remove = useCallback(
    (id) => {
      const item = saved.find((it) => it.id === id);
      const result = writeAndVerify(saved.filter((it) => it.id !== id), { mustNotHave: id });
      if (result.ok) setSaved(saved.filter((it) => it.id !== id));
      return { ...result, item };
    },
    [saved],
  );

  const restoreSamples = useCallback(() => {
    const samples = createSampleSaved();
    const result = writeAndVerify(samples);
    if (result.ok) setSaved(samples);
    return result;
  }, []);

  return { saved, add, remove, restoreSamples };
}
