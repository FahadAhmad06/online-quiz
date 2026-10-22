import { useState, useEffect } from 'react';
// Client-side pagination over an already-fetched list. Jumps back to page 1 when `resetKey` changes (e.g. a filter).
export default function usePaged(rows, size = 15, resetKey) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / size)), p = Math.min(page, pages);
  return {
    rows: rows.slice((p - 1) * size, p * size), page: p, pages, total: rows.length,
    from: rows.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, rows.length), setPage
  };
}
