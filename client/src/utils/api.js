import load from './load';
import save from './save';
// Calls the server. Adds the admin or student token if logged in; throws Error(message) on failure.
export default async function api(path, { method = 'GET', body } = {}) {
  const key = path.startsWith('/admin') ? 'qr_admin' : 'qr_student'; // papers/attempts routes also carry the student token
  const s = load(key, null, sessionStorage);
  const res = await fetch((import.meta.env.VITE_API_URL || '') + '/api' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(s?.token ? { Authorization: 'Bearer ' + s.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && s) {
    sessionStorage.removeItem(key);
    if (key === 'qr_student') save('qr_student_msg', data.error || 'Please log in again.', sessionStorage);
    location.assign(key === 'qr_admin' ? '/admin-login' : '/student-login');
  }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = res.status; throw e; }
  return data;
}
