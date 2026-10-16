export default function remaining(p) {
  if (!p.expiresAt) return 'No expiry';
  const ms = new Date(p.expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired ' + new Date(p.expiresAt).toLocaleString();
  const m = Math.ceil(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
  return 'Closes in ' + (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + (m % 60) + 'm';
}
