import { useEffect, useRef } from 'react';
import { RoomRole } from '@nlmlio/shared';
import type { RoomNotice } from '@nlmlio/shared';
import { useRoomStore } from '../../stores/room-store';

// 디자인의 이모티콘 버튼. 실제 전송은 채팅(FUNC-004) 이벤트가 머지되면 연결한다.
const EMOJI_LABELS = ['ㅋㅋ', 'GG', '!!', '?!', 'ㅠㅠ', '굿'];

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

/** 대기실 오른쪽 패널. 지금은 방 안내만 보여 주고, 메시지 입력은 채팅 기능이 붙으면 연다. */
export function RoomChat() {
  const notices = useRoomStore((state) => state.notices);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [notices]);
  return (
    <aside className="room-chat" aria-label="채팅">
      <p className="mono-label room-chat-title">CHAT</p>
      <ol className="room-chat-log" ref={listRef} aria-live="polite">
        {notices.map((entry) => (
          <li key={entry.id} className="chat-notice">
            {noticeText(entry.notice)}
          </li>
        ))}
      </ol>
      <div className="room-chat-form">
        <div className="emoji-row">
          {EMOJI_LABELS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-chip"
              data-mono={/^[A-Z!?]+$/.test(emoji) || undefined}
              disabled
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="chat-input-row">
          <input placeholder="채팅은 곧 연결돼요" aria-label="메시지 입력" disabled />
          <button type="button" disabled>
            전송
          </button>
        </div>
      </div>
    </aside>
  );
}
