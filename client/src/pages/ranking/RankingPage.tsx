import { useState } from 'react';
import type { RankingResponse } from '@nlmlio/shared';
import { useApiResource } from '../../hooks/use-api-resource';
import { Pagination, PageState } from '../../components/PageState';

export function RankingPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApiResource<RankingResponse>(
    `/ranking?page=${page}&pageSize=10`,
  );
  return (
    <main className="records-page">
      <h1>랭킹</h1>
      <p className="page-description">
        포인트가 같으면 먼저 해당 점수에 도달한 플레이어가 앞섭니다.
      </p>
      <PageState loading={loading} error={error} retry={reload} />
      {!loading && !error && data && (
        <>
          <div className="my-ranking">
            <span>내 순위</span>
            <strong>{data.me.rank}위</strong>
            <span>{data.me.nickname}</span>
            <span className="lime">{data.me.point.toLocaleString()} P</span>
          </div>
          <div className="table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th scope="col">RANK</th>
                  <th scope="col">PLAYER</th>
                  <th scope="col">POINT</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.userId} className={user.userId === data.me.userId ? 'my-row' : ''}>
                    <td className={user.rank === 1 ? 'lime' : ''}>{user.rank}</td>
                    <td>
                      {user.nickname}
                      {user.userId === data.me.userId && <span className="me-label">나</span>}
                    </td>
                    <td>{user.point.toLocaleString()} P</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </main>
  );
}
