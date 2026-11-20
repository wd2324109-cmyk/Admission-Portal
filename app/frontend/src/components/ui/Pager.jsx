export default function Pager({ page, pages, onPage }) {
  if (!(pages > 1)) return null;
  return <nav className="pager" aria-label="Pagination">
    <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
    <span>Page {page} of {pages}</span>
    <button type="button" className="btn btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
  </nav>;
}
