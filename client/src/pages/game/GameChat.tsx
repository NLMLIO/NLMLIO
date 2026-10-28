import { useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH } from '@nlmlio/shared';
import type { LogEntry } from './game-view';
import { playerColorStyle } from './PlayerSeat';

/** 미리 정해진 감정표현(FUNC-004-02) */
export const EMOTES = ['ㅋㅋ', 'GG', '!!', '?!', 'ㅠㅠ', '굿'] as const;

interface GameChatProps {
  log: LogEntry[];
  onSendChat: (text: string) => void;
  onSendEmote: (emote: string) => void;
}

/** 오른쪽 채팅·게임 로그 패널 */
export function GameChat({ log, onSendChat, onSendEmote }: GameChatProps) {
  const [draft, setDraft] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendChat(text);
    setDraft('');
  }
  return (
    <aside className="game-chat" aria-label="채팅">
      <h2 className="game-chat-title">CHAT · LOG</h2>
      <ol className="game-log" aria-live="polite">
        {log.map((entry) => (
          <li key={entry.id} className={`log-${entry.kind}`}>
            {entry.kind === 'chat' && (
              <>
                <b style={playerColorStyle(entry.color)}>{entry.nickname}</b>
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
          {EMOTES.map((emote) => (
            <button
              key={emote}
              type="button"
              className="emote-chip"
              onClick={() => onSendEmote(emote)}
            >
              {emote}
            </button>
          ))}
        </div>
        <form className="chat-form" onSubmit={submit}>
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
