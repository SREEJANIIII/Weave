export function ownerHeaders() {
  let ownerId = 'default';
  try {
    ownerId = localStorage.getItem('weave:owner:v1');
    if (!ownerId) { ownerId = crypto.randomUUID(); localStorage.setItem('weave:owner:v1', ownerId); }
  } catch {
    // The backend's default owner keeps this prototype usable when storage is blocked.
  }
  return { 'X-Weave-User': ownerId };
}

/** JSON helper for the Weave server. Never throws: a network failure comes back as { ok: false, network: true }. */
export async function api(path, body, method) {
  try {
    const headers = ownerHeaders();
    const resolvedMethod = method || (body === undefined ? 'GET' : 'POST');
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      method: resolvedMethod,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, network: true, data: { error: 'Weave couldn’t reach its server.' } };
  }
}
