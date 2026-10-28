import { create } from 'zustand';
import type { ChatEmojiCode, ChatMessageEvent, RoomNotice, RoomResponse } from '@nlmlio/shared';

export type LogEntry =
  | { id: number; kind: 'notice'; notice: RoomNotice }
  | ({ id: number; kind: 'chat' } & ChatMessageEvent);

interface RoomState {
  connected: boolean;
  /** 연결 뒤 첫 room:state를 받았는지 */
  synced: boolean;
  room: RoomResponse | null;
  log: LogEntry[];
  /** 회원 위에 잠깐 띄우는 이모티콘 */
  emojis: Record<number, { emoji: ChatEmojiCode; id: number }>;
  kicked: boolean;
}

const MAX_LOG = 200;
const EMOJI_VISIBLE_MS = 2500;
let nextId = 1;

/** 서버가 보낸 방 상태의 거울. 소켓 이벤트로만 바꾸고, 규칙은 계산하지 않는다(CLAUDE.md 6.6). */
export const useRoomStore = create<RoomState>(() => ({
  connected: false,
  synced: false,
  room: null,
  log: [],
  emojis: {},
  kicked: false,
}));

const append = (entry: LogEntry) =>
  useRoomStore.setState((state) => ({ log: [...state.log, entry].slice(-MAX_LOG) }));

export const roomActions = {
  connection(connected: boolean) {
    useRoomStore.setState(connected ? { connected } : { connected, synced: false });
  },
  state(room: RoomResponse | null) {
    useRoomStore.setState((state) => ({
      room,
      synced: true,
      // 다른 방으로 바뀌거나 방을 나가면 채팅 기록을 비운다.
      ...(state.room?.code !== room?.code ? { log: [], emojis: {} } : {}),
      ...(room ? { kicked: false } : {}),
    }));
  },
  notice(notice: RoomNotice) {
    append({ id: nextId++, kind: 'notice', notice });
  },
  chat(message: ChatMessageEvent) {
    append({ id: nextId++, kind: 'chat', ...message });
  },
  emoji(userId: number, emoji: ChatEmojiCode) {
    const id = nextId++;
    useRoomStore.setState((state) => ({ emojis: { ...state.emojis, [userId]: { emoji, id } } }));
    setTimeout(() => {
      useRoomStore.setState((state) => {
        if (state.emojis[userId]?.id !== id) return state;
        const { [userId]: _expired, ...rest } = state.emojis;
        return { emojis: rest };
      });
    }, EMOJI_VISIBLE_MS);
  },
  kicked() {
    useRoomStore.setState({ kicked: true });
  },
  clearKicked() {
    useRoomStore.setState({ kicked: false });
  },
};
