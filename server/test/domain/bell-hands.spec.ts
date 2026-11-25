import { BellHands } from '../../src/domain/game/bell-hands';

describe('서버 기준 손 접수 순서', () => {
  it('처음 받은 손을 맨 아래에 두고 판정 표시가 끝날 때까지 늦게 눌러도 접수 순서대로 쌓는다', () => {
    const hands = new BellHands(7, 1000, 2800, [1, 2, 3, 4], 3);
    expect(hands.snapshot().userIds).toEqual([3]);
    expect(hands.add(2, 7, 1100)).toBe(true);
    expect(hands.add(1, 7, 1500)).toBe(true);
    expect(hands.add(4, 7, 2800)).toBe(true);
    expect(hands.snapshot()).toMatchObject({
      userIds: [3, 2, 1, 4],
      displayUntil: 2800,
    });
  });
  it('판정 표시가 끝난 뒤의 손은 받지 않는다', () => {
    const hands = new BellHands(7, 1000, 2800, [1, 2, 3], 3);
    expect(hands.acceptsAt(2800)).toBe(true);
    expect(hands.acceptsAt(2801)).toBe(false);
    expect(hands.add(2, 7, 2801)).toBe(false);
    expect(hands.snapshot().userIds).toEqual([3]);
  });
  it('중복 손·관전자·다른 테이블·과거 시각은 받지 않는다', () => {
    const hands = new BellHands(7, 1000, 2800, [1, 2], 1);
    expect(hands.add(1, 7, 1010)).toBe(false);
    expect(hands.add(99, 7, 1010)).toBe(false);
    expect(hands.add(2, 6, 1010)).toBe(false);
    expect(hands.add(2, 7, 999)).toBe(false);
    expect(hands.snapshot().userIds).toEqual([1]);
  });
  it('스냅샷을 바꿔도 서버 내부 순서와 자격을 바꿀 수 없다', () => {
    const hands = new BellHands(7, 1000, 2800, [1, 2], 1);
    const copy = hands.snapshot();
    copy.userIds.push(99);
    copy.eligibleUserIds.push(99);
    expect(hands.add(99, 7, 1010)).toBe(false);
    expect(hands.snapshot().userIds).toEqual([1]);
  });
});
