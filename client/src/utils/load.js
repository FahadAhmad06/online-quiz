export default function load(key, fallback, store = localStorage) {
  try { const v = JSON.parse(store.getItem(key)); return v === null ? fallback : v; } catch { return fallback; }
}
