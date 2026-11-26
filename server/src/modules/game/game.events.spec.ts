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
    events.action('123456', { ...action, skillId: SkillId.MINE, ratMined: true });
    expect(to).not.toHaveBeenCalled();
  });

  it.each<[string, GameActionEvent, string | string[]]>([
    ['종 부수기', { ...action, skillId: SkillId.BELL_BREAK }, 'room:123456'],
    ['자기 카드 강화', { ...action, skillId: SkillId.SPARKLE_CARD }, ['user:1']],
    [
      '대상을 지정하는 침 뱉기는 모두에게',
      { ...action, skillId: SkillId.SPIT, targetUserId: 2 },
      'room:123456',
    ],
    ['해킹도 모두에게', { ...action, skillId: SkillId.HACK, targetUserId: 2 }, 'room:123456'],
    [
      '무지개 반사가 오가도 모두에게 전달',
      { ...action, skillId: SkillId.AMATERASU, targetUserId: 1, reflectedBy: [2, 1] },
      'room:123456',
    ],
    [
      '손 내려치기도 모두에게',
      { ...action, skillId: SkillId.HAND_SMASH, targetUserId: 2 },
      'room:123456',
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
