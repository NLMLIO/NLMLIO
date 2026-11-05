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

/** 디자인 표기 `10.20 14:12`. */
function playedAt(iso: string): string {
  const date = new Date(iso);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getMonth() + 1)}.${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
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
            <table className="records-table history-table">
              <thead>
                <tr>
                  <th scope="col">DATE</th>
                  <th scope="col">ROOM</th>
                  <th scope="col">PLAYERS</th>
                  <th scope="col">RANK</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td className="empty-state" colSpan={4}>
                      아직 플레이한 게임이 없습니다.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item) => (
                    <tr key={item.gameId}>
                      <td>
                        <time dateTime={item.playedAt}>{playedAt(item.playedAt)}</time>
                      </td>
                      <td>{item.roomName}</td>
                      <td className="muted">{item.players}</td>
                      <td className={item.departed ? 'muted' : item.rank === 1 ? 'lime' : ''}>
                        {item.departed ? '이탈' : ordinal(item.rank)}
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
