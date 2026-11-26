import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { describeServices } from '../lib/services';

// What the person has allowed, kept in this browser: { calendar: 'granted' | 'declined', ..., reader: 'granted' }.
// Nothing is used until it is granted here; the server is told to match on every load.
const KEY = 'weave:consent:v1';

function readConsent() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function useConnections() {
  const [status, setStatus] = useState(null);
  const [offline, setOffline] = useState(false);
  const [synced, setSynced] = useState(false);
  const [consent, setConsent] = useState(readConsent);
  const [pending, setPending] = useState({});
  const consentRef = useRef(consent);

  const remember = useCallback((next) => {
    consentRef.current = next;
    setConsent(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Consent still applies for this visit; it just won't be remembered.
    }
  }, []);

  /** Make the server read only what the person allowed. */
  const sync = useCallback(async (st) => {
    let latest = st;
    for (const app of st.apps) {
      if (app.status !== 'connected') continue;
      const want = consentRef.current[app.id] === 'granted';
      if (app.enabled !== want) {
        const r = await api(`/api/apps/${encodeURIComponent(app.id)}`, { enabled: want });
        if (r.ok) latest = r.data;
      }
    }
    setStatus(latest);
    return latest;
  }, []);

  const load = useCallback(async () => {
    const r = await api('/api/status');
    if (!r.ok) {
      setOffline(true);
      setSynced(true);
      return null;
    }
    setOffline(false);
    const latest = await sync(r.data);
    setSynced(true);
    return latest;
  }, [sync]);

  useEffect(() => {
    load();
  }, [load]);

  const setService = useCallback(
    async (id, allow) => {
      remember({ ...consentRef.current, [id]: allow ? 'granted' : 'declined' });
      setPending((p) => ({ ...p, [id]: true }));
      const r = await api(`/api/apps/${encodeURIComponent(id)}`, { enabled: allow });
      setPending((p) => ({ ...p, [id]: false }));
      if (r.ok) setStatus(r.data);
      return r.ok;
    },
    [remember],
  );

  const connectMany = useCallback(
    async (ids) => {
      const next = { ...consentRef.current };
      for (const id of ids) next[id] = 'granted';
      remember(next);
      let latest = null;
      for (const id of ids) {
        const r = await api(`/api/apps/${encodeURIComponent(id)}`, { enabled: true });
        if (r.ok) latest = r.data;
      }
      if (latest) setStatus(latest);
      return Boolean(latest);
    },
    [remember],
  );

  const setReader = useCallback((allow) => remember({ ...consentRef.current, reader: allow ? 'granted' : 'declined' }), [remember]);

  const services = useMemo(() => describeServices(status, consent), [status, consent]);
  const decided = Object.keys(consent).some((k) => k !== 'reader');

  return {
    status,
    setStatus,
    offline,
    synced,
    services,
    connected: services.filter((s) => s.state === 'connected'),
    pending,
    firstRun: synced && !offline && Boolean(status) && !decided,
    readerAllowed: consent.reader === 'granted',
    reload: load,
    resync: sync,
    setService,
    connectMany,
    setReader,
  };
}
