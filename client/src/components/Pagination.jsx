import Icon from './Icon';
// Controls for usePaged(). Hidden when everything fits on one page.
export default function Pagination({ page, pages, total, from, to, setPage }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted">Showing {from}–{to} of {total}</span>
      <div className="pages">
        <button className="ghost small" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><Icon name="chevronLeft" size={16} /></button>
        <span>Page {page} of {pages}</span>
        <button className="ghost small" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><Icon name="chevronRight" size={16} /></button>
      </div>
    </nav>
  );
}
