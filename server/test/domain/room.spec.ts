import { Room } from '../../src/domain/room/room';
import type { CreateRoomInput } from '../../src/domain/room/room';

const host = { userId: 1, nickname: '방장' };
function input(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
  return { code: '012345', name: '점심 내기 한판', maxPlayers: 4, host, ...overrides };
}

describe('Room', () => {
  it('만든 회원이 방장이자 유일한 참가자인 대기 중 방이 된다', () => {
    expect(Room.create(input({ name: '  점심 내기  ' })).snapshot()).toEqual({
      code: '012345',
      name: '점심 내기',
      maxPlayers: 4,
      status: 'WAITING',
      hostId: 1,
      members: [host],
    });
  });

  it.each([
    ['6자리 숫자가 아닌 코드', { code: '12345' }],
    ['공백뿐인 이름', { name: '   ' }],
    ['20자를 넘는 이름', { name: '가'.repeat(21) }],
    ['2명 미만 인원', { maxPlayers: 1 }],
    ['6명 초과 인원', { maxPlayers: 7 }],
    ['정수가 아닌 인원', { maxPlayers: 3.5 }],
  ])('%s는 거부한다', (_, overrides) => {
    expect(() => Room.create(input(overrides))).toThrow();
  });

  it('2~6명과 20자 이름은 허용한다', () => {
    for (const maxPlayers of [2, 6])
      expect(Room.create(input({ maxPlayers, name: '가'.repeat(20) })).snapshot().maxPlayers).toBe(
        maxPlayers,
      );
  });

  it('마지막 인원이 나가면 빈 방이 된다', () => {
    const room = Room.create(input());
    room.leave(1);
    expect(room.isEmpty).toBe(true);
    expect(room.has(1)).toBe(false);
  });

  it('참가자의 관전 상태를 보존하고 인원 초과·중복 참가를 막는다', () => {
    const room = Room.create(input({ maxPlayers: 2 }));
    room.join({ userId: 2, nickname: '참가자' });
    room.markSpectator(2);
    expect(room.snapshot().members[1]).toEqual({
      userId: 2,
      nickname: '참가자',
      isSpectator: true,
    });
    expect(() => room.join({ userId: 3, nickname: '초과' })).toThrow();
    expect(() => room.markSpectator(3)).toThrow();
  });

  it('참가자가 아닌 회원은 나갈 수 없다', () => {
    expect(() => Room.create(input()).leave(2)).toThrow();
  });
});
