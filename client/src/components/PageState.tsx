export function PageState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="page-state" role="alert">
        <p>{error}</p>
        <button className="button outline" onClick={retry}>
          다시 시도
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="page-state" role="status">
        <span className="loader" />
        데이터를 불러오는 중입니다.
      </div>
    );
  return null;
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="페이지 이동">
      <button className="button outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        이전
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button
        className="button outline"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        다음
      </button>
    </nav>
  );
}
