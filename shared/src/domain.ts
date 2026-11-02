export const RoomStatus = { WAITING: 'WAITING', PLAYING: 'PLAYING' } as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

/** 방 안에서의 자리. 참가자는 게임에 참여하고, 관전자는 보기·채팅만 한다. */
export const RoomRole = { PLAYER: 'PLAYER', SPECTATOR: 'SPECTATOR' } as const;
export type RoomRole = (typeof RoomRole)[keyof typeof RoomRole];

/** 카드에 그려진 과일 4종(FUNC-005-02). 카드 56장 = 과일마다 1개×5, 2개×3, 3개×3, 4개×2, 5개×1 */
export const Fruit = {
  STRAWBERRY: 'STRAWBERRY',
  BANANA: 'BANANA',
  LIME: 'LIME',
  PLUM: 'PLUM',
} as const;

export type Fruit = (typeof Fruit)[keyof typeof Fruit];
