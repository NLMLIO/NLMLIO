import { useState } from 'react';
import type { CurrentRoomResponse } from '@nlmlio/shared';
import { api, errorMessage } from '../../api/http';
import { PageState } from '../../components/PageState';
import { useApiResource } from '../../hooks/use-api-resource';

/** 임시 대기실: 방 코드·복사(FUNC-003-02)와 나가기만 있다. 실시간 입장·채팅은 소켓 구현 후 붙인다. */
export function WaitingRoomPage({ onLeft }: { onLeft: () => void }) {
  const { data, error, loading, reload } = useApiResource<CurrentRoomResponse>('/rooms/me');
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState('');
  if (loading || error) return <PageState loading={loading} error={error} retry={reload} />;
  const room = data?.room;
  if (!room)
    return (
      <div className="page-state">
        <p>참가 중인 방이 없습니다.</p>
        <button className="button outline" onClick={onLeft}>
          돌아가기
        </button>
      </div>
    );
  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setActionError('복사하지 못했습니다. 코드를 직접 선택해 복사해주세요.');
    }
  }
  async function leave() {
    try {
      await api<void>('/rooms/me/leave', { method: 'POST' });
      onLeft();
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }
  return (
    <main className="create-room-page">
      <section className="create-room" aria-labelledby="waiting-room-title">
        <header className="create-room-header">
          <h1 id="waiting-room-title">{room.name}</h1>
          <span className="mono-label">
            {room.members.length} / {room.maxSize}
          </span>
        </header>
        <div className="room-code-info">
          <p className="mono-label lime">ROOM CODE</p>
          <div className="room-code-row">
            <strong className="room-code">{room.code}</strong>
            <button className="button outline" onClick={() => void copyCode(room.code)}>
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </div>
        <div className="create-room-field">
          <span className="mono-label">ROOM MEMBERS · 관전자 포함</span>
          <ul className="room-members">
            {room.members.map((member) => (
              <li key={member.userId}>
                {member.nickname}
                {member.userId === room.hostId && <span className="mono-label lime">HOST</span>}
                {member.isSpectator && <span className="mono-label">관전</span>}
              </li>
            ))}
          </ul>
        </div>
        {actionError && (
          <p className="feedback error" role="alert">
            {actionError}
          </p>
        )}
        <div className="create-room-actions">
          <button className="button outline" onClick={() => void leave()}>
            나가기
          </button>
        </div>
      </section>
    </main>
  );
}
