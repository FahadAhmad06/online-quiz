import load from './load';
// Calls the server. Adds the admin token if logged in; throws Error(message) on failure.
export default async function api(path, { method = 'GET', body } = {}) {
  const s = load('qr_admin', null, sessionStorage);
  const res = await fetch('/api' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(s?.token ? { Authorization: 'Bearer ' + s.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && s) { sessionStorage.removeItem('qr_admin'); location.assign('/admin-login'); }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = res.status; throw e; }
  return data;
}
