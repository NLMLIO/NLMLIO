import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH, ChatEmoji } from '@nlmlio/shared';
import type { ChatEmojiCode } from '@nlmlio/shared';
import type { LogEntry } from './game-view';
import { playerColorStyle } from './PlayerSeat';

/** 미리 정해진 감정표현(FUNC-004-02). 서버 허용 목록과 같다 */
const EMOTE_CODES = Object.keys(ChatEmoji) as ChatEmojiCode[];

interface GameChatProps {
  log: LogEntry[];
  /** 보냈으면 null, 실패하면 안내 문구 */
  onSendChat: (text: string) => Promise<string | null> | void;
  onSendEmote: (emote: ChatEmojiCode) => Promise<string | null> | void;
}

/** 오른쪽 채팅·게임 로그 패널 */
export function GameChat({ log, onSendChat, onSendEmote }: GameChatProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [log]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const failure = (await onSendChat(text)) ?? null;
    setSending(false);
    setError(failure ?? '');
    if (!failure) setDraft('');
  }
  async function emote(code: ChatEmojiCode) {
    setError((await onSendEmote(code)) ?? '');
  }
  return (
    <aside className="game-chat" aria-label="채팅">
      <h2 className="game-chat-title">CHAT · LOG</h2>
      <ol className="game-log" aria-live="polite" ref={listRef}>
        {log.map((entry) => (
          <li key={entry.id} className={`log-${entry.kind}`}>
            {entry.kind === 'chat' && (
              <>
                <b style={playerColorStyle(entry.color)}>{entry.nickname}</b>
                {entry.spectator && <small className="log-tag">관전</small>}
                <span>{entry.text}</span>
              </>
            )}
            {entry.kind === 'event' && (
              <>
                <b className={entry.tone}>{entry.nickname}</b>
                <span className={entry.tone}>{entry.text}</span>
              </>
            )}
            {entry.kind === 'system' && entry.text}
          </li>
        ))}
      </ol>
      <div className="game-chat-footer">
        <div className="emote-row" aria-label="감정표현">
          {EMOTE_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className="emote-chip"
              aria-label={`이모티콘 ${ChatEmoji[code]}`}
              onClick={() => void emote(code)}
            >
              {ChatEmoji[code]}
            </button>
          ))}
        </div>
        {error && (
          <p className="game-chat-error" role="alert">
            {error}
          </p>
        )}
        <form className="chat-form" onSubmit={(event) => void submit(event)}>
          <input
            aria-label="메시지"
            placeholder="메시지 입력"
            maxLength={CHAT_MAX_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit">전송</button>
        </form>
      </div>
    </aside>
  );
}
