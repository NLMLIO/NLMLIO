import { GameServerEvent, SkillId } from '@nlmlio/shared';
import type { GameActionEvent } from '@nlmlio/shared';
import type { Server } from 'socket.io';
import { GameEvents } from './game.events';

describe('스킬 사용 알림의 수신 범위 (FUNC-009-04)', () => {
  const action = {
    kind: 'skill',
    gameId: 'game',
    revision: 4,
    userId: 1,
    targetUserId: null,
  } as const;

  it('지뢰를 설치해도 시전자와 관전자를 포함해 사용 알림을 전송하지 않는다', () => {
    const to = jest.fn();
    const events = new GameEvents();
    events.attach({ to } as unknown as Server);
    events.action('123456', { ...action, skillId: SkillId.MINE });
    expect(to).not.toHaveBeenCalled();
  });

  it.each<[string, GameActionEvent, string | string[]]>([
    ['종 부수기', { ...action, skillId: SkillId.BELL_BREAK }, 'room:123456'],
    ['자기 카드 강화', { ...action, skillId: SkillId.SPARKLE_CARD }, ['user:1']],
    ['피격 대상', { ...action, skillId: SkillId.SPIT, targetUserId: 2 }, ['user:1', 'user:2']],
    [
      '무지개 반사로 시전자가 맞아도 반사자에게 전달',
      { ...action, skillId: SkillId.HACK, targetUserId: 1, reflectedBy: 2 },
      ['user:1', 'user:2'],
    ],
  ])('%s', (_name, payload, rooms) => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const events = new GameEvents();
    events.attach({ to } as unknown as Server);
    events.action('123456', payload);
    expect(to.mock.calls).toEqual([[rooms]]);
    expect(emit.mock.calls).toEqual([[GameServerEvent.ACTION, payload]]);
  });
});
