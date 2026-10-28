import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH, ChatEmoji, RoomRole } from '@nlmlio/shared';
import type { ChatEmojiCode, RoomNotice, RoomResponse } from '@nlmlio/shared';
import { sendChat } from '../../socket/socket';
import { useRoomStore } from '../../stores/room-store';
import { colorOf } from './member-color';

const EMOJI_CODES = Object.keys(ChatEmoji) as ChatEmojiCode[];

function noticeText(notice: RoomNotice): string {
  switch (notice.type) {
    case 'joined':
      return `${notice.nickname}님이 입장했습니다.`;
    case 'left':
      return `${notice.nickname}님이 나갔습니다.`;
    case 'kicked':
      return `${notice.nickname}님이 추방되었습니다.`;
    case 'moved':
      return `${notice.nickname}님이 ${notice.role === RoomRole.PLAYER ? '참가자로' : '관전석으로'} 이동했습니다.`;
    case 'host':
      return `${notice.nickname}님이 방장이 되었습니다.`;
    case 'started':
      return '게임이 시작되었습니다.';
  }
}

/** 대기실 채팅(FUNC-004-01)과 감정표현 이모티콘(004-02). 방 안내도 같은 기록에 남긴다. */
export function RoomChat({ room }: { room: RoomResponse }) {
  const log = useRoomStore((state) => state.log);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [log]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    const failure = await sendChat('message', text);
    setSending(false);
    setError(failure ?? '');
    if (!failure) setMessage('');
  }
  return (
    <aside className="room-chat" aria-label="채팅">
      <p className="mono-label room-chat-title">CHAT</p>
      <ol className="room-chat-log" ref={listRef} aria-live="polite">
        {log.map((entry) =>
          entry.kind === 'notice' ? (
            <li key={entry.id} className="chat-notice">
              {noticeText(entry.notice)}
            </li>
          ) : (
            <li key={entry.id}>
              <strong style={{ color: colorOf(room, entry.userId) }}>{entry.nickname}</strong>
              {entry.isSpectator && <span className="mono-label">관전</span>}
              <span>{entry.message}</span>
            </li>
          ),
        )}
      </ol>
      <form className="room-chat-form" onSubmit={send}>
        <div className="emoji-row">
          {EMOJI_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className="emoji-chip"
              aria-label={`이모티콘 ${ChatEmoji[code]}`}
              onClick={() =>
                void sendChat('emoji', code).then((failure) => setError(failure ?? ''))
              }
            >
              {ChatEmoji[code]}
            </button>
          ))}
        </div>
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <div className="chat-input-row">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={CHAT_MAX_LENGTH}
            placeholder="메시지 입력"
            aria-label="메시지 입력"
          />
          <button type="submit" disabled={!message.trim() || sending}>
            전송
          </button>
        </div>
      </form>
    </aside>
  );
}
