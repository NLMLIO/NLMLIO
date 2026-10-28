import { useCallback, useEffect, useState } from 'react';
import type { AuthResponse, PublicUser } from '@nlmlio/shared';
import { api, refreshSession, setAccessToken } from './api/http';
import { AuthPage } from './pages/auth/AuthPage';
import { CreateRoomPage } from './pages/lobby/CreateRoomPage';
import { MyPage } from './pages/mypage/MyPage';
import { HistoryPage } from './pages/ranking/HistoryPage';
import { RankingPage } from './pages/ranking/RankingPage';
import { WaitingRoomPage } from './pages/room/WaitingRoomPage';
import './styles/app.css';

const PAGES = ['mypage', 'history', 'ranking', 'create-room', 'room'] as const;
type Page = (typeof PAGES)[number];
function pageFromHash(): Page {
  const page = location.hash.slice(1);
  return PAGES.find((name) => name === page) ?? 'mypage';
}

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState<Page>(pageFromHash);
  const leaveCreateRoom = useCallback(() => navigate('mypage'), []);
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (active) setUser(session.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => {
      setUser(null);
      setNotice('로그인이 만료되었습니다. 다시 로그인해주세요.');
    };
    const hashChanged = () => setPage(pageFromHash());
    window.addEventListener('nlmlio:session-expired', expired);
    window.addEventListener('hashchange', hashChanged);
    return () => {
      active = false;
      window.removeEventListener('nlmlio:session-expired', expired);
      window.removeEventListener('hashchange', hashChanged);
    };
  }, []);
  function navigate(next: Page) {
    location.hash = next;
    setPage(next);
  }
  function login(session: AuthResponse) {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setNotice('');
  }
  async function logout(message = '') {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken('');
      setUser(null);
      setNotice(message);
    }
  }
  if (loading)
    return (
      <main className="page-state" role="status">
        <span className="loader" />
        로그인 상태를 확인하고 있습니다.
      </main>
    );
  if (!user) return <AuthPage onLogin={login} notice={notice} />;
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#mypage" onClick={() => navigate('mypage')}>
          낼래말래
        </a>
        <nav aria-label="주 메뉴" className="main-nav">
          <button disabled title="로비는 아직 구현되지 않았습니다.">
            로비
          </button>
          <a href="#create-room" aria-current={page === 'create-room' ? 'page' : undefined}>
            방 만들기
          </a>
          <a href="#ranking" aria-current={page === 'ranking' ? 'page' : undefined}>
            랭킹
          </a>
          <a href="#history" aria-current={page === 'history' ? 'page' : undefined}>
            전적
          </a>
          <a href="#mypage" aria-current={page === 'mypage' ? 'page' : undefined}>
            마이페이지
          </a>
        </nav>
        <div className="header-account">
          <div>
            <p>{user.nickname}</p>
            <span className="lime">{user.point.toLocaleString()} P</span>
          </div>
          <span className="avatar small" aria-hidden="true">
            {user.nickname.slice(0, 1)}
          </span>
        </div>
        <button
          className="button outline logout-button"
          onClick={() => {
            void logout().catch(() => {});
          }}
        >
          로그아웃
        </button>
      </header>
      {page === 'mypage' && (
        <MyPage
          onProfileChange={setUser}
          onHistory={() => navigate('history')}
          onPasswordChanged={() => {
            void logout('비밀번호를 변경했습니다. 새 비밀번호로 로그인해주세요.').catch(() => {});
          }}
        />
      )}
      {page === 'history' && <HistoryPage />}
      {page === 'ranking' && <RankingPage />}
      {page === 'create-room' && (
        <CreateRoomPage onCancel={leaveCreateRoom} onCreated={() => navigate('room')} />
      )}
      {page === 'room' && <WaitingRoomPage onLeft={() => navigate('mypage')} />}
    </div>
  );
}
