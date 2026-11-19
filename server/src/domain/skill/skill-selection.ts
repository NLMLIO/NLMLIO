import type { RoomRole, SkillId } from '@nlmlio/shared';

export interface SkillParticipant {
  userId: number;
  role: RoomRole;
}

/** 한 사람의 선택 결과. 고른 후보 칸과 들어간 보유 칸, 받지 않았는지 */
export interface SkillOutcome {
  candidate: number | null;
  slot: number | null;
  declined: boolean;
}

/** 스킬 선택 한 번(009-01): 사람마다 후보 3칸과 마감 시각, 누가 골랐는지를 담는다. */
export class SkillSelection {
  private readonly chosen = new Map<number, SkillOutcome>();

  constructor(
    private readonly entries: Map<number, { role: RoomRole; candidates: SkillId[] }>,
    readonly deadline: number,
  ) {}

  get userIds(): number[] {
    return [...this.entries.keys()];
  }
  has(userId: number): boolean {
    return this.entries.has(userId);
  }
  roleOf(userId: number): RoomRole | undefined {
    return this.entries.get(userId)?.role;
  }
  candidates(userId: number): SkillId[] {
    return [...(this.entries.get(userId)?.candidates ?? [])];
  }
  hasChosen(userId: number): boolean {
    return this.chosen.has(userId);
  }
  markChosen(userId: number, outcome: SkillOutcome): void {
    this.chosen.set(userId, outcome);
  }
  /** 아직 안 골랐으면 null */
  outcome(userId: number): SkillOutcome | null {
    return this.chosen.get(userId) ?? null;
  }
  remove(userId: number): void {
    this.entries.delete(userId);
    this.chosen.delete(userId);
  }
  /** 남은 사람이 모두 골랐나. 대상이 없어도 끝난 것으로 본다 */
  get complete(): boolean {
    return [...this.entries.keys()].every((userId) => this.chosen.has(userId));
  }
  pending(): number[] {
    return [...this.entries.keys()].filter((userId) => !this.chosen.has(userId));
  }
}
