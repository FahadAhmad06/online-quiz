export default function timeAgo(d) {
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + ' minute' + (m === 1 ? '' : 's') + ' ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
  const dd = Math.round(h / 24); if (dd < 30) return dd + ' day' + (dd === 1 ? '' : 's') + ' ago';
  return new Date(d).toLocaleDateString();
}
