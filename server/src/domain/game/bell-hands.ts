import { BELL_LATE_HAND_MS } from '@nlmlio/shared';
import type { BellHandsView } from '@nlmlio/shared';

/**
 * 점수 판정과 분리된 손 표시 순서. 시각은 서버 Gateway가 접수한 값만 사용한다.
 * 첫 손(판정자) 이후의 손은 새 카드가 공개되기 전까지 언제 도착해도 접수 순서대로 올라간다(시각 효과만).
 * 판정 표시가 끝난 뒤에 늦게 올라온 손은 잠깐 보이도록 표시 마감을 그만큼 늘린다.
 */
export class BellHands {
  private readonly userIds: number[];
  private shownUntil: number;
  constructor(
    private readonly turnSeq: number,
    private readonly firstReceivedAt: number,
    displayUntil: number,
    private readonly eligibleUserIds: readonly number[],
    firstUserId: number,
  ) {
    this.userIds = [firstUserId];
    this.shownUntil = displayUntil;
  }

  add(userId: number, turnSeq: number, receivedAt: number): boolean {
    if (
      turnSeq !== this.turnSeq ||
      !Number.isFinite(receivedAt) ||
      receivedAt < this.firstReceivedAt ||
      !this.eligibleUserIds.includes(userId) ||
      this.userIds.includes(userId)
    )
      return false;
    this.userIds.push(userId);
    if (receivedAt > this.shownUntil - BELL_LATE_HAND_MS)
      this.shownUntil = receivedAt + BELL_LATE_HAND_MS;
    return true;
  }

  snapshot(): BellHandsView {
    return {
      turnSeq: this.turnSeq,
      displayUntil: this.shownUntil,
      eligibleUserIds: [...this.eligibleUserIds],
      userIds: [...this.userIds],
    };
  }
}
