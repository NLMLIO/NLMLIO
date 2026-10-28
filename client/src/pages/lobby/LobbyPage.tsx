import { useState, type FormEvent } from 'react';
import { MAX_PLAYERS, ROOM_CODE_PATTERN } from '@nlmlio/shared';
import type { JoinRoomRequest, PublicUser, RoomResponse } from '@nlmlio/shared';
import { api, errorMessage } from '../../api/http';
import { useRoomStore } from '../../stores/room-store';

const STEPS = [
  ['01', '방 만들기', '방장이 방 이름을 정하면 6자리 방 코드가 생겨요.'],
  ['02', '코드 공유', '대기실의 6자리 방 코드를 친구에게 보내요.'],
  ['03', '게임 시작', '참가자가 2명 이상 모이면 방장이 게임을 시작해요.'],
] as const;

export function LobbyPage({
  user,
  notice,
  onCreate,
  onEnterRoom,
}: {
  user: PublicUser;
  notice: string;
  onCreate: () => void;
  onEnterRoom: () => void;
}) {
  const currentRoom = useRoomStore((state) => state.room);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  async function join(event: FormEvent) {
    event.preventDefault();
    if (!ROOM_CODE_PATTERN.test(code) || joining) return;
    setJoining(true);
    setError('');
    try {
      const body: JoinRoomRequest = { code };
      await api<RoomResponse>('/rooms/join', { method: 'POST', body: JSON.stringify(body) });
      onEnterRoom();
    } catch (cause) {
      setError(errorMessage(cause));
      setJoining(false);
    }
  }
  return (
    <main className="lobby">
      <section className="lobby-main" aria-labelledby="lobby-title">
        <h1 id="lobby-title">게임 시작</h1>
        <p className="mono-label">ALL ROOMS PRIVATE · 6자리 코드로만 참가</p>
        {notice && (
          <p className="lobby-notice" role="status">
            {notice}
          </p>
        )}
        {currentRoom && (
          <div className="lobby-notice">
            <span>
              참가 중인 방 <strong>{currentRoom.name}</strong>이 있어요.
            </span>
            <button className="button outline" onClick={onEnterRoom}>
              대기실로 돌아가기
            </button>
          </div>
        )}
        <div className="lobby-cards">
          <article className="lobby-card create">
            <p className="mono-label lime">CREATE ROOM</p>
            <h2>방 만들기</h2>
            <p className="lobby-card-desc">
              방을 만들면 6자리 방 코드가 생겨요.
              <br />
              코드를 친구에게 보내면 바로 함께할 수 있어요.
            </p>
            <div className="lobby-cards-art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="lobby-card-actions">
              <button className="button primary" onClick={onCreate} disabled={!!currentRoom}>
                방 만들기
              </button>
              <span className="mono-label">최대 {MAX_PLAYERS}명 · 방장이 시작</span>
            </div>
          </article>
          <form className="lobby-card" onSubmit={join}>
            <p className="mono-label">JOIN WITH CODE</p>
            <h2>코드로 참가</h2>
            <p className="lobby-card-desc">친구에게 받은 6자리 방 코드를 입력하세요.</p>
            <div className="lobby-card-actions">
              <label className="code-boxes">
                <span className="visually-hidden">방 코드 6자리</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  disabled={!!currentRoom}
                />
                {Array.from({ length: 6 }, (_, index) => (
                  <span
                    key={index}
                    className="code-box"
                    data-active={index === Math.min(code.length, 5) || undefined}
                  >
                    {code[index]}
                  </span>
                ))}
              </label>
              <button
                type="submit"
                className="button outline"
                disabled={!ROOM_CODE_PATTERN.test(code) || joining}
              >
                참가
              </button>
            </div>
            {error && (
              <p className="feedback error" role="alert">
                {error}
              </p>
            )}
          </form>
        </div>
        <p className="mono-label lobby-steps-label">HOW IT WORKS</p>
        <ol className="lobby-steps">
          {STEPS.map(([number, title, text]) => (
            <li key={number}>
              <p>
                <span className="lime">{number}</span> {title}
              </p>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>
      <aside className="lobby-profile" aria-label="내 프로필">
        <p className="mono-label">MY PROFILE</p>
        <div className="lobby-profile-row">
          <span className="avatar small" aria-hidden="true">
            {user.nickname.slice(0, 1)}
          </span>
          <div>
            <p>{user.nickname}</p>
            <span>가입일 {user.createdAt.slice(0, 10).replaceAll('-', '.')}</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
