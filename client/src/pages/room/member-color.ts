import type { RoomResponse } from '@nlmlio/shared';

const MEMBER_COLORS = ['#c6f432', '#ff4f8b', '#ffd23f', '#a77bff', '#5ec8ff', '#ff8a3d'];

// 자리를 옮겨도 색이 바뀌지 않게, 방마다 회원이 처음 보일 때 정한 색을 기억한다.
let roomCode = '';
const assigned = new Map<number, number>();

/** 회원 색. 지금 방에 있는 사람이 쓰지 않는 색 중 첫 번째를 준다. */
export function colorOf(room: RoomResponse, userId: number): string {
  if (room.code !== roomCode) {
    roomCode = room.code;
    assigned.clear();
  }
  for (const member of room.members) {
    if (assigned.has(member.userId)) continue;
    const used = new Set(
      room.members.flatMap((other) =>
        assigned.has(other.userId) ? [assigned.get(other.userId)!] : [],
      ),
    );
    const free = MEMBER_COLORS.findIndex((_, index) => !used.has(index));
    assigned.set(member.userId, free === -1 ? assigned.size % MEMBER_COLORS.length : free);
  }
  return MEMBER_COLORS[assigned.get(userId) ?? 0];
}
