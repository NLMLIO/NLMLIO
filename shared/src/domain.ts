// 프론트·백엔드가 함께 쓰는 도메인 enum

export const RoomStatus = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
} as const;

export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];
