import type { GameSnapshot } from '@nlmlio/shared';

/** 같은 브라우저의 카드 요청이 진행 중이면 종 의도는 그 응답 뒤 최신 스냅샷으로 보낸다. */
export class GameInputSequence {
  private card: Promise<string | null> | null = null;

  get playing(): boolean {
    return this.card !== null;
  }

  play(send: () => Promise<string | null>): Promise<string | null> {
    if (this.card) return this.card;
    const request = send().finally(() => {
      if (this.card === request) this.card = null;
    });
    this.card = request;
    return request;
  }

  async beforeBell(): Promise<void> {
    await this.card;
  }
}

/**
 * 모션 접수 가능 여부도 서버가 보낸 참가자·손 목록만 읽는다. 승패는 계산하지 않는다.
 * 서버가 손 목록을 보내는 동안(새 카드가 공개되기 전)은 늦게 눌러도 손이 올라간다.
 */
export function canJoinBellHandWindow(snapshot: GameSnapshot | null, userId: number): boolean {
  const hands = snapshot?.bellHands;
  return !!hands && hands.eligibleUserIds.includes(userId) && !hands.userIds.includes(userId);
}
