import { SKILL_SLOT_COUNT } from '@nlmlio/shared';
import type { SkillId } from '@nlmlio/shared';

/** 밖에서 읽기만 할 수 있는 보유 칸 */
export interface SkillHolding {
  list(): SkillId[];
  readonly isFull: boolean;
  has(skillId: SkillId): boolean;
}

/** 한 사람의 스킬 보유 칸(최대 3개). 스킬은 한 번 쓰면 사라진다(009-03). */
export class SkillInventory implements SkillHolding {
  private skills: SkillId[] = [];

  get isFull(): boolean {
    return this.skills.length >= SKILL_SLOT_COUNT;
  }
  list(): SkillId[] {
    return [...this.skills];
  }
  has(skillId: SkillId): boolean {
    return this.skills.includes(skillId);
  }
  add(skillId: SkillId): void {
    if (this.isFull) throw new Error('Skill slots are full');
    this.skills.push(skillId);
  }
  replace(slot: number, skillId: SkillId): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.skills.length)
      throw new Error('Invalid skill slot');
    this.skills[slot] = skillId;
  }
  /** 같은 스킬이 여러 개여도 하나만 쓴다. 갖고 있지 않으면 false */
  use(skillId: SkillId): boolean {
    const slot = this.skills.indexOf(skillId);
    if (slot < 0) return false;
    this.skills.splice(slot, 1);
    return true;
  }
  clear(): void {
    this.skills = [];
  }
}
