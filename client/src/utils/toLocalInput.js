// ISO date -> value for <input type="datetime-local"> in the browser's timezone.
export default function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso), pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
