import { useCallback, useState } from 'react';

async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function useAppliances(enabled) {
  const [summary, setSummary] = useState({ appliances: [], documents: [], deadlines: [], reminders: [], today: null });
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const [list, pending, upcoming, reminders] = await Promise.all([
        request('/api/appliances'),
        request('/api/appliances/documents?status=pending_review'),
        request('/api/appliances/deadlines/upcoming?withinDays=365'),
        request('/api/appliances/reminders'),
      ]);
      if (!list.ok || !pending.ok || !upcoming.ok || !reminders.ok) throw new Error(list.data.error || pending.data.error || upcoming.data.error || reminders.data.error || 'Could not load appliances.');
      setSummary({
        appliances: list.data.appliances ?? [],
        documents: pending.data.documents ?? [],
        deadlines: upcoming.data.deadlines ?? [],
        reminders: reminders.data.reminders ?? [],
        today: upcoming.data.today ?? null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const openAppliance = useCallback(async (id) => {
    const res = await request(`/api/appliances/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError(res.data.error ?? 'Could not load appliance details.');
      return;
    }
    setDetails(res.data);
  }, []);

  const upload = useCallback(async (file, kind, handwritten) => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    form.append('handwritten', handwritten ? 'true' : 'false');
    const res = await fetch('/api/appliances/documents', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
    await load();
    return data.document;
  }, [load]);

  const confirm = useCallback(async (documentId, payload) => {
    const res = await request(`/api/appliances/documents/${encodeURIComponent(documentId)}/confirm`, json(payload));
    if (!res.ok) throw new Error(res.data.error ?? 'Could not confirm this document.');
    await load();
    if (res.data.appliance?.id) await openAppliance(res.data.appliance.id);
    return res.data;
  }, [load, openAppliance]);

  const updateAppliance = useCallback(async (id, changes) => {
    const res = await request(`/api/appliances/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    if (!res.ok) throw new Error(res.data.error ?? 'Could not update this appliance.');
    await load();
    await openAppliance(id);
    return res.data;
  }, [load, openAppliance]);

  const updateDeadline = useCallback(async (id, changes) => {
    const res = changes?.dueDate
      ? await request(`/api/appliances/deadlines/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
      : await request(`/api/appliances/deadlines/${encodeURIComponent(id)}/complete`, json({}));
    if (!res.ok) throw new Error(res.data.error ?? 'Could not update this deadline.');
    await load();
    if (details) await openAppliance(details.appliance.id);
    return res.data;
  }, [load, details, openAppliance]);

  const reminderAction = useCallback(async (id, action) => {
    const res = await request(`/api/appliances/reminders/${encodeURIComponent(id)}/${action}`, json({}));
    if (!res.ok) throw new Error(res.data.error ?? 'Could not update this reminder.');
    await load();
    if (details) await openAppliance(details.appliance.id);
    return res.data;
  }, [load, details, openAppliance]);

  return { summary, details, loading, error, setError, load, openAppliance, upload, confirm, updateAppliance, updateDeadline, reminderAction };
}
