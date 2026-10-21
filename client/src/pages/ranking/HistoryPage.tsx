import { useState } from 'react';
import type { HistoryResponse } from '@nlmlio/shared';
import { useApiResource } from '../../hooks/use-api-resource';
import { Pagination, PageState } from '../../components/PageState';
import { Stats } from '../../components/Stats';

function ordinal(rank: number): string {
  const endings = ['th', 'st', 'nd', 'rd'];
  const number = rank % 100;
  return `${rank}${endings[(number - 20) % 10] ?? endings[number] ?? endings[0]}`;
}

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApiResource<HistoryResponse>(
    `/users/me/history?page=${page}&pageSize=10`,
  );
  return (
    <main className="records-page">
      <h1>내 전적</h1>
      <PageState loading={loading} error={error} retry={reload} />
      {!loading && !error && data && (
        <>
          <Stats stats={data.stats} />
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th scope="col">DATE</th>
                  <th scope="col">ROOM</th>
                  <th scope="col">PLAYERS</th>
                  <th scope="col">RANK</th>
                  <th scope="col">POINT</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td className="empty-state" colSpan={5}>
                      아직 플레이한 게임이 없습니다.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item) => (
                    <tr key={item.gameId}>
                      <td>
                        <time dateTime={item.playedAt}>
                          {new Intl.DateTimeFormat('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hourCycle: 'h23',
                          }).format(new Date(item.playedAt))}
                        </time>
                      </td>
                      <td>{item.roomName}</td>
                      <td>{item.players}</td>
                      <td className={item.rank === 1 && !item.departed ? 'lime' : ''}>
                        {item.departed ? '이탈' : ordinal(item.rank)}
                      </td>
                      <td
                        className={
                          item.rank === 1 && !item.departed
                            ? 'lime'
                            : item.point === 0
                              ? 'muted'
                              : ''
                        }
                      >
                        {item.point > 0 ? `+${item.point}` : item.point}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </main>
  );
}
