import type { BellHandsView } from '@nlmlio/shared';

/**
 * 점수 판정과 분리된 손 표시 순서. 시각은 서버 Gateway가 접수한 값만 사용한다.
 * 첫 손(판정자) 이후의 손은 판정 결과를 보여 주는 동안 언제 도착해도 접수 순서대로 올라간다(시각 효과만).
 */
export class BellHands {
  private readonly userIds: number[];
  constructor(
    private readonly turnSeq: number,
    private readonly firstReceivedAt: number,
    private readonly displayUntil: number,
    private readonly eligibleUserIds: readonly number[],
    firstUserId: number,
  ) {
    this.userIds = [firstUserId];
  }

  /** 이 시각에 도착한 손을 아직 올릴 수 있나(판정 결과를 보여 주는 동안) */
  acceptsAt(receivedAt: number): boolean {
    return (
      Number.isFinite(receivedAt) &&
      receivedAt >= this.firstReceivedAt &&
      receivedAt <= this.displayUntil
    );
  }

  add(userId: number, turnSeq: number, receivedAt: number): boolean {
    if (
      turnSeq !== this.turnSeq ||
      !this.acceptsAt(receivedAt) ||
      !this.eligibleUserIds.includes(userId) ||
      this.userIds.includes(userId)
    )
      return false;
    this.userIds.push(userId);
    return true;
  }

  snapshot(): BellHandsView {
    return {
      turnSeq: this.turnSeq,
      displayUntil: this.displayUntil,
      eligibleUserIds: [...this.eligibleUserIds],
      userIds: [...this.userIds],
    };
  }
}
