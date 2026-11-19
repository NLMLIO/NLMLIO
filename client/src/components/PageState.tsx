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

/** 맨 앞·맨 뒤 쪽과 현재 쪽 앞뒤 2쪽. 사이에 한 쪽만 빠지면 줄임표 대신 그 번호를 보인다. */
export function pageItems(page: number, totalPages: number): (number | 'gap')[] {
  const shown = new Set([1, totalPages]);
  for (let near = page - 2; near <= page + 2; near++) {
    if (near >= 1 && near <= totalPages) shown.add(near);
  }
  const items: (number | 'gap')[] = [];
  let previous = 0;
  for (const current of [...shown].sort((a, b) => a - b)) {
    if (current - previous === 2) items.push(current - 1);
    else if (current - previous > 2) items.push('gap');
    items.push(current);
    previous = current;
  }
  return items;
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
      <button className="page-step" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        이전
      </button>
      {pageItems(page, totalPages).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="page-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            className="page-number"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        className="page-step"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        다음
      </button>
    </nav>
  );
}
