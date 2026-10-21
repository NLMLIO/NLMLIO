import type { DashboardResponse, PublicUser } from '@nlmlio/shared';
import { useApiResource } from '../../hooks/use-api-resource';
import { PageState } from '../../components/PageState';
import { reactionTime } from '../../components/Stats';
import { ProfileForm } from './ProfileForm';

export function MyPage({
  onProfileChange,
  onHistory,
  onPasswordChanged,
}: {
  onProfileChange: (user: PublicUser) => void;
  onHistory: () => void;
  onPasswordChanged: () => void;
}) {
  const { data, error, loading, reload, setData } =
    useApiResource<DashboardResponse>('/users/me/dashboard');
  if (loading || error || !data)
    return <PageState loading={loading} error={error} retry={reload} />;
  const { user, stats, rank } = data;
  return (
    <main className="mypage-layout">
      <section className="dashboard" aria-label="개인 대시보드">
        <div className="profile-heading">
          <span className="avatar large" aria-hidden="true">
            {user.nickname.slice(0, 1)}
          </span>
          <div>
            <h1>{user.nickname}</h1>
            <p>
              가입일 {new Date(user.createdAt).toLocaleDateString('ko-KR')}
              <span>{user.username}</span>
            </p>
          </div>
        </div>
        <dl className="metric-grid primary-metrics">
          <div>
            <dt>보유 포인트</dt>
            <dd className="lime">{user.point.toLocaleString()}</dd>
          </div>
          <div>
            <dt>랭킹 순위</dt>
            <dd>{rank.toLocaleString()}위</dd>
          </div>
        </dl>
        <div className="section-heading">
          <h2>누적 전적</h2>
          <button className="text-button" onClick={onHistory}>
            전적 전체 보기
          </button>
        </div>
        <div
          className="win-progress"
          role="progressbar"
          aria-label="승률"
          aria-valuenow={stats.winRate}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${stats.winRate}%` }} />
        </div>
        <div className="win-caption">
          <span>{stats.totalGames} GAMES</span>
          <span className="lime">{stats.wins} WIN</span>
          <span>{stats.losses} LOSE</span>
          <span>{stats.winRate.toFixed(1)}%</span>
        </div>
        {stats.totalGames === 0 && (
          <p className="no-games-note">
            아직 플레이 기록이 없습니다. 첫 게임을 마치면 전적이 표시됩니다.
          </p>
        )}
        <dl className="metric-grid secondary-metrics">
          <div>
            <dt>종 치기 성공률</dt>
            <dd>{stats.bellSuccessRate.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>평균 반응 속도</dt>
            <dd>{reactionTime(stats.averageReactionMs)}</dd>
          </div>
          <div>
            <dt>누적 오발</dt>
            <dd>{stats.bellFail.toLocaleString()}회</dd>
          </div>
        </dl>
      </section>
      <ProfileForm
        user={user}
        onSave={(next) => {
          onProfileChange(next);
          setData((current) => (current ? { ...current, user: next } : current));
        }}
        onPasswordChanged={onPasswordChanged}
      />
    </main>
  );
}
