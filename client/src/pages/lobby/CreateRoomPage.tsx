import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_MAX_PLAYERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  validRoomName,
} from '@nlmlio/shared';
import type { CreateRoomRequest, RoomResponse } from '@nlmlio/shared';
import { api, errorMessage } from '../../api/http';

const PLAYER_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, index) => MIN_PLAYERS + index,
);

export function CreateRoomPage({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (room: RoomResponse) => void;
}) {
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [onCancel]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validRoomName(roomName) || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const body: CreateRoomRequest = { roomName: roomName.trim(), maxPlayers };
      onCreated(await api<RoomResponse>('/rooms', { method: 'POST', body: JSON.stringify(body) }));
    } catch (cause) {
      setError(errorMessage(cause));
      setSubmitting(false);
    }
  }
  return (
    <main className="create-room-page">
      <form className="create-room" aria-labelledby="create-room-title" onSubmit={submit}>
        <header className="create-room-header">
          <h1 id="create-room-title">방 만들기</h1>
          <button
            type="button"
            className="mono-label esc-button"
            onClick={onCancel}
            aria-label="취소하고 돌아가기"
          >
            ESC
          </button>
        </header>
        <label className="create-room-field">
          <span className="mono-label">ROOM NAME</span>
          <input
            className="room-name-input"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            maxLength={ROOM_NAME_MAX_LENGTH}
            placeholder="방 이름을 입력하세요"
            autoFocus
          />
        </label>
        <div className="room-code-info">
          <p className="mono-label lime">PRIVATE ROOM</p>
          <p>방을 만들면 6자리 방 코드가 생겨요. 코드를 받은 친구만 들어올 수 있어요.</p>
        </div>
        <div className="create-room-field">
          <span className="mono-label" id="max-players-label">
            MAX PLAYERS
          </span>
          <div className="player-chips" role="radiogroup" aria-labelledby="max-players-label">
            {PLAYER_OPTIONS.map((count) => (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={maxPlayers === count}
                className="player-chip"
                onClick={() => setMaxPlayers(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        <div className="create-room-actions">
          <button type="button" className="button outline" onClick={onCancel}>
            취소
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!validRoomName(roomName) || submitting}
          >
            만들기
          </button>
        </div>
      </form>
    </main>
  );
}
