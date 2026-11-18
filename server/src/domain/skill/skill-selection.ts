import type { RoomRole, SkillId } from '@nlmlio/shared';

export interface SkillParticipant {
  userId: number;
  role: RoomRole;
}

/** 스킬 선택 한 번(009-01): 사람마다 후보 3칸과 마감 시각, 누가 골랐는지를 담는다. */
export class SkillSelection {
  private readonly chosen = new Set<number>();

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
  markChosen(userId: number): void {
    this.chosen.add(userId);
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
