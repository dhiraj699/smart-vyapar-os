import { API_BASE } from './config.js';

/** Thin fetch wrapper: JSON in/out, throws Error with .status, .details, and formatted message on non-2xx. */
async function request(method, path, body, { signal } = {}) {
  let res;
  const headers = {
    Accept: 'application/json',
  };

  // Attach JWT Bearer token if user is logged in
  try {
    const token = localStorage.getItem('vyapar.token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    /* localStorage disabled or unavailable */
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const e = new Error('Cannot reach the server. Check your connection or offline mode.');
    e.status = 0;
    e.isOffline = true;
    throw e;
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (res.status === 401) {
    // Session expired or invalid token
    try {
      window.dispatchEvent(new CustomEvent('vyapar:unauthorized'));
    } catch {
      /* ignore in non-browser */
    }
  }

  if (!res.ok) {
    let msg = payload?.message || `Request failed with status ${res.status}`;
    if (payload?.errors && Array.isArray(payload.errors) && payload.errors.length) {
      const details = payload.errors.map((e) => e.message || e.path).filter(Boolean).join('; ');
      if (details) msg = `${msg}: ${details}`;
    }
    const e = new Error(msg);
    e.status = res.status;
    e.details = payload?.errors;
    throw e;
  }
  return payload;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body ?? {}, opts),
  put: (path, body, opts) => request('PUT', path, body ?? {}, opts),
  delete: (path, opts) => request('DELETE', path, undefined, opts),
};

export default api;
