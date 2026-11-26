/** JSON helper for the Weave server. Never throws: a network failure comes back as { ok: false, network: true }. */
export async function api(path, body) {
  try {
    const res = await fetch(
      path,
      body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, network: true, data: { error: 'Weave couldn’t reach its server.' } };
  }
}
