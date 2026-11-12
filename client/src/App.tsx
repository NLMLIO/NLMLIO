import { useCallback, useEffect, useState } from 'react';
import { GameStatus, RoomStatus } from '@nlmlio/shared';
import type { AuthResponse, PublicUser } from '@nlmlio/shared';
import { api, refreshSession, setAccessToken } from './api/http';
import { connectSocket, disconnectSocket } from './socket/socket';
import { useGameStore } from './stores/game-store';
import { roomActions, useRoomStore } from './stores/room-store';
import { AuthPage } from './pages/auth/AuthPage';
import { GamePage } from './pages/game/GamePage';
import { GamePreviewPage } from './pages/game/GamePreviewPage';
import { CreateRoomPage } from './pages/lobby/CreateRoomPage';
import { LobbyPage } from './pages/lobby/LobbyPage';
import { MyPage } from './pages/mypage/MyPage';
import { HistoryPage } from './pages/ranking/HistoryPage';
import { RankingPage } from './pages/ranking/RankingPage';
import { WaitingRoomPage } from './pages/room/WaitingRoomPage';
import './styles/app.css';
import './styles/game.css';

const PAGES = [
  'lobby',
  'mypage',
  'history',
  'ranking',
  'create-room',
  'room',
  'game',
  // 개발 서버 전용: 고정 상태로 게임 화면 장면을 확인한다(#game-preview/<장면>).
  ...(import.meta.env.DEV ? (['game-preview'] as const) : []),
] as const;
type Page = (typeof PAGES)[number];
function pageFromHash(): Page {
  // #game-preview/my-turn 처럼 '/' 뒤는 페이지 안에서 쓰는 값이다.
  const page = location.hash.slice(1).split('/')[0];
  return PAGES.find((name) => name === page) ?? 'lobby';
}

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState<Page>(pageFromHash);
  const [lobbyNotice, setLobbyNotice] = useState('');
  const kicked = useRoomStore((state) => state.kicked);
  const leaveCreateRoom = useCallback(() => navigate('lobby'), []);
  const toLobby = useCallback(() => navigate('lobby'), []);
  const toWaitingRoom = useCallback(() => navigate('room'), []);
  // 게임이 시작되거나 진행 중인 게임에 다시 연결되면 게임 화면으로 옮긴다(005-01, 003-07).
  const liveGameId = useGameStore((state) =>
    state.snapshot?.status === GameStatus.PLAYING ? state.snapshot.gameId : null,
  );
  const loggedIn = user !== null;
  const roomPlaying = useRoomStore((state) => state.room?.status === RoomStatus.PLAYING);
  useEffect(() => {
    if ((liveGameId || roomPlaying) && page !== 'game' && page !== 'game-preview') navigate('game');
  }, [liveGameId, roomPlaying, page]);
  useEffect(() => {
    if (!loggedIn) return;
    connectSocket();
    return disconnectSocket;
  }, [loggedIn]);
  useEffect(() => {
    if (!kicked) return;
    roomActions.clearKicked();
    setLobbyNotice('방장이 방에서 내보냈어요. 방 코드로 다시 들어갈 수 있어요.');
    navigate('lobby');
  }, [kicked]);
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
    if (next !== 'lobby') setLobbyNotice('');
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
  // 대기실은 디자인대로 상단 메뉴 없이 화면 전체를 쓴다.
  if (page === 'room') return <WaitingRoomPage userId={user.id} onLeft={() => navigate('lobby')} />;
  // 게임 화면은 상단 메뉴 없이 창 전체를 쓴다.
  if (page === 'game')
    return <GamePage user={user} onLobby={toLobby} onWaitingRoom={toWaitingRoom} />;
  if (page === 'game-preview')
    return <GamePreviewPage onExit={toLobby} onWaitingRoom={toWaitingRoom} />;
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#lobby" onClick={() => navigate('lobby')}>
          낼래말래
        </a>
        <nav aria-label="주 메뉴" className="main-nav">
          <a
            href="#lobby"
            aria-current={page === 'lobby' || page === 'create-room' ? 'page' : undefined}
          >
            로비
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
          <p>{user.nickname}</p>
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
      {page === 'lobby' && (
        <LobbyPage
          user={user}
          notice={lobbyNotice}
          onCreate={() => navigate('create-room')}
          onEnterRoom={() => navigate('room')}
        />
      )}
    </div>
  );
}
