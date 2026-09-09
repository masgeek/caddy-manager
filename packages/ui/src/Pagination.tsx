interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination">
      <ul className="pagination pagination-sm justify-content-center mb-0 mt-2">
        <li className={`page-item ${page === 0 ? "disabled" : ""}`}>
          <button
            className="page-link"
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </button>
        </li>
        {Array.from({ length: totalPages }, (_, index) => (
          <li
            key={index}
            className={`page-item ${index === page ? "active" : ""}`}
          >
            <button
              className="page-link"
              aria-label={`Page ${index + 1}`}
              aria-current={index === page ? "page" : undefined}
              onClick={() => onPageChange(index)}
            >
              {index + 1}
            </button>
          </li>
        ))}
        <li className={`page-item ${page >= totalPages - 1 ? "disabled" : ""}`}>
          <button
            className="page-link"
            aria-label="Next page"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  );
}
