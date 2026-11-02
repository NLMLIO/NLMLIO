import { Room, RoomRuleError } from '../../src/domain/room/room';
import type { CreateRoomInput } from '../../src/domain/room/room';

const host = { userId: 1, nickname: '방장' };
const user = (userId: number) => ({ userId, nickname: `회원${userId}` });
function input(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
  return { code: '012345', name: '점심 내기 한판', host, ...overrides };
}
/** 방장 포함 count명이 들어온 방 */
function roomWith(count: number): Room {
  const room = Room.create(input());
  for (let id = 2; id <= count; id++) room.join(user(id));
  return room;
}
function ruleError(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof RoomRuleError) return error.code;
    throw error;
  }
  throw new Error('규칙 위반이 일어나지 않았다');
}
const roles = (room: Room) =>
  room
    .snapshot()
    .members.map((member) => member.role[0])
    .join('');

describe('Room', () => {
  it('만든 회원이 방장이자 유일한 참가자인 대기 중 방이 된다', () => {
    expect(Room.create(input({ name: '  점심 내기  ' })).snapshot()).toEqual({
      code: '012345',
      name: '점심 내기',
      status: 'WAITING',
      hostId: 1,
      members: [{ ...host, role: 'PLAYER' }],
    });
  });

  it.each([
    ['6자리 숫자가 아닌 코드', { code: '12345' }],
    ['공백뿐인 이름', { name: '   ' }],
    ['20자를 넘는 이름', { name: '가'.repeat(21) }],
  ])('%s는 거부한다', (_, overrides) => {
    expect(() => Room.create(input(overrides))).toThrow();
  });

  it('20자 이름은 허용한다', () => {
    expect(Room.create(input({ name: '가'.repeat(20) })).snapshot().name).toBe('가'.repeat(20));
  });

  describe('참가', () => {
    it('참가자 6명까지는 참가자로, 그다음 10명은 관전자로 앉고 그 뒤로는 ROOM_FULL', () => {
      const room = roomWith(16);
      expect(roles(room)).toBe('P'.repeat(6) + 'S'.repeat(10));
      expect(ruleError(() => room.join(user(17)))).toBe('ROOM_FULL');
    });

    it('이미 들어온 회원은 다시 들어올 수 없다', () => {
      expect(ruleError(() => roomWith(2).join(user(2)))).toBe('ALREADY_IN_ROOM');
    });

    it('게임 중인 방에는 관전자로도 들어올 수 없다', () => {
      const room = roomWith(2);
      room.start(1);
      expect(ruleError(() => room.join(user(3)))).toBe('ROOM_IN_GAME');
    });
  });

  describe('자리 이동', () => {
    it('본인은 관전석과 참가석을 오갈 수 있고, 옮긴 칸의 맨 뒤로 간다', () => {
      const room = roomWith(3);
      room.move(2, 2, 'SPECTATOR');
      expect(roles(room)).toBe('PPS');
      room.move(2, 2, 'PLAYER');
      expect(room.snapshot().members.map((member) => member.userId)).toEqual([1, 3, 2]);
    });

    it('방장은 다른 회원을 옮길 수 있지만 일반 회원은 못 한다', () => {
      const room = roomWith(3);
      room.move(1, 3, 'SPECTATOR');
      expect(room.roleOf(3)).toBe('SPECTATOR');
      expect(ruleError(() => room.move(2, 3, 'PLAYER'))).toBe('NOT_ROOM_HOST');
    });

    it('참가석이 가득 차면 참가자로 옮길 수 없다', () => {
      const room = roomWith(7);
      expect(ruleError(() => room.move(7, 7, 'PLAYER'))).toBe('ROOM_FULL');
    });

    it('같은 칸으로 옮기면 바뀌는 것이 없다', () => {
      expect(roomWith(2).move(2, 2, 'PLAYER')).toBe(false);
    });
  });

  describe('추방', () => {
    it('방장이 추방하면 방에서 빠지고, 다시 코드로 들어올 수 있다', () => {
      const room = roomWith(3);
      room.kick(1, 2);
      expect(room.has(2)).toBe(false);
      expect(room.join(user(2))).toBe('PLAYER');
    });

    it('방장이 아니거나 자기 자신이면 추방할 수 없다', () => {
      const room = roomWith(3);
      expect(ruleError(() => room.kick(2, 3))).toBe('NOT_ROOM_HOST');
      expect(ruleError(() => room.kick(1, 1))).toBe('VALIDATION_FAILED');
      expect(ruleError(() => room.kick(1, 9))).toBe('USER_NOT_FOUND');
    });
  });

  describe('방장 위임', () => {
    it('관전자에게도 방장을 넘길 수 있다', () => {
      const room = roomWith(2);
      room.move(2, 2, 'SPECTATOR');
      room.delegate(1, 2);
      expect(room.snapshot().hostId).toBe(2);
      expect(ruleError(() => room.start(1))).toBe('NOT_ROOM_HOST');
    });

    it('방장이 나가면 가장 먼저 들어온 남은 회원이 방장이 된다', () => {
      const room = roomWith(3);
      room.leave(1);
      expect(room.snapshot().hostId).toBe(2);
    });
  });

  describe('게임 시작', () => {
    it('참가자가 2명 미만이면 NOT_ENOUGH_PLAYERS, 관전자는 세지 않는다', () => {
      const room = roomWith(2);
      room.move(1, 2, 'SPECTATOR');
      expect(ruleError(() => room.start(1))).toBe('NOT_ENOUGH_PLAYERS');
    });

    it('시작하면 게임 중이 되고 방 설정을 바꿀 수 없다', () => {
      const room = roomWith(2);
      room.start(1);
      expect(room.snapshot().status).toBe('PLAYING');
      expect(ruleError(() => room.move(2, 2, 'SPECTATOR'))).toBe('ROOM_IN_GAME');
      expect(ruleError(() => room.kick(1, 2))).toBe('ROOM_IN_GAME');
    });
  });

  it('게임에서 탈락한 참가자는 방에 남은 채 관전자가 된다', () => {
    const room = roomWith(2);
    room.start(1);
    room.markSpectator(2);
    expect(room.roleOf(2)).toBe('SPECTATOR');
    expect(ruleError(() => room.markSpectator(9))).toBe('USER_NOT_FOUND');
  });

  it('마지막 인원이 나가면 빈 방이 된다', () => {
    const room = Room.create(input());
    room.leave(1);
    expect(room.isEmpty).toBe(true);
  });

  it('참가하지 않은 회원은 나갈 수 없다', () => {
    expect(ruleError(() => Room.create(input()).leave(2))).toBe('NOT_IN_ROOM');
  });
});
