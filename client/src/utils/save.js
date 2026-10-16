export default function save(key, val, store = localStorage) { store.setItem(key, JSON.stringify(val)); }
