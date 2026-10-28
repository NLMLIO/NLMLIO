export const RoomStatus = { WAITING: 'WAITING', PLAYING: 'PLAYING' } as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

/** 방 안에서의 자리. 참가자는 게임에 참여하고, 관전자는 보기·채팅만 한다. */
export const RoomRole = { PLAYER: 'PLAYER', SPECTATOR: 'SPECTATOR' } as const;
export type RoomRole = (typeof RoomRole)[keyof typeof RoomRole];
