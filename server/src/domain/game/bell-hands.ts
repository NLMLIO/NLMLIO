import { BELL_HAND_WINDOW_MS } from '@nlmlio/shared';
import type { BellHandsView } from '@nlmlio/shared';

/** 점수 판정과 분리된 손 표시 순서. 시각은 서버 Gateway가 접수한 값만 사용한다. */
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

  add(userId: number, turnSeq: number, receivedAt: number): boolean {
    if (
      !Number.isFinite(receivedAt) ||
      turnSeq !== this.turnSeq ||
      receivedAt < this.firstReceivedAt ||
      receivedAt > this.firstReceivedAt + BELL_HAND_WINDOW_MS ||
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
      windowClosesAt: this.firstReceivedAt + BELL_HAND_WINDOW_MS,
      displayUntil: this.displayUntil,
      eligibleUserIds: [...this.eligibleUserIds],
      userIds: [...this.userIds],
    };
  }
}
