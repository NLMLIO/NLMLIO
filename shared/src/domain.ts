// 프론트·백엔드가 함께 쓰는 도메인 enum

export const RoomStatus = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
} as const;

export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

/** 카드에 그려진 과일 4종(FUNC-005-02). 카드 56장 = 과일마다 1개×5, 2개×3, 3개×3, 4개×2, 5개×1 */
export const Fruit = {
  STRAWBERRY: 'STRAWBERRY',
  BANANA: 'BANANA',
  LIME: 'LIME',
  PLUM: 'PLUM',
} as const;

export type Fruit = (typeof Fruit)[keyof typeof Fruit];
