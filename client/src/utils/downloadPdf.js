import load from './load';

// Download a PDF (or any binary) from an admin/student API endpoint that streams a file
// instead of JSON. Shared by every "Download PDF" button — admin, owner and student.
export default async function downloadFile(path, filename, storeKey = 'qr_admin') {
  const s = load(storeKey, null, sessionStorage);
  const res = await fetch('/api' + path, { headers: s?.token ? { Authorization: 'Bearer ' + s.token } : {} });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || 'Failed to generate the file.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
