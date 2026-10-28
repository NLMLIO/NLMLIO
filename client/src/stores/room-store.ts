import { create } from 'zustand';
import type { RoomNotice, RoomResponse } from '@nlmlio/shared';

export interface NoticeEntry {
  id: number;
  notice: RoomNotice;
}

interface RoomState {
  connected: boolean;
  /** 연결 뒤 첫 room:state를 받았는지 */
  synced: boolean;
  room: RoomResponse | null;
  notices: NoticeEntry[];
  kicked: boolean;
}

const MAX_NOTICES = 100;
let nextId = 1;

/** 서버가 보낸 방 상태의 거울. 소켓 이벤트로만 바꾸고, 규칙은 계산하지 않는다(CLAUDE.md 6.6). */
export const useRoomStore = create<RoomState>(() => ({
  connected: false,
  synced: false,
  room: null,
  notices: [],
  kicked: false,
}));

export const roomActions = {
  connection(connected: boolean) {
    useRoomStore.setState(connected ? { connected } : { connected, synced: false });
  },
  state(room: RoomResponse | null) {
    useRoomStore.setState((state) => ({
      room,
      synced: true,
      // 다른 방으로 바뀌거나 방을 나가면 안내 기록을 비운다.
      ...(state.room?.code !== room?.code ? { notices: [] } : {}),
      ...(room ? { kicked: false } : {}),
    }));
  },
  notice(notice: RoomNotice) {
    useRoomStore.setState((state) => ({
      notices: [...state.notices, { id: nextId++, notice }].slice(-MAX_NOTICES),
    }));
  },
  kicked() {
    useRoomStore.setState({ kicked: true });
  },
  clearKicked() {
    useRoomStore.setState({ kicked: false });
  },
};
