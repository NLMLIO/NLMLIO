import {
  ErrorCode,
  SKILL_CANDIDATE_COUNT,
  SKILL_PICK_EVERY,
  SKILL_PICK_TIME_MS,
  SKILL_SLOT_COUNT,
} from '@nlmlio/shared';
import { SkillInventory } from './skill-inventory';
import type { SkillHolding } from './skill-inventory';
import { SkillSelection } from './skill-selection';
import type { SkillParticipant } from './skill-selection';
import { pickIndex, rollCandidates } from './skill-roll';
import type { Random } from './skill-roll';

export class SkillRuleError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

/** 후보 칸 하나를 고르거나(`slot`), 보유 칸이 가득 찼을 때 바꿀 칸(`replace`)을 함께 고르거나, 받지 않는다. */
export type SkillChoice = { slot: number; replace?: number } | { decline: true };

const invalid = (): SkillRuleError => new SkillRuleError(ErrorCode.VALIDATION_FAILED);
const validSlot = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < SKILL_CANDIDATE_COUNT;

/**
 * 게임 한 판의 스킬 상태(FUNC-009): 종 성공 횟수, 사람별 보유 칸, 진행 중인 선택.
 * 시간은 서버가 넘겨준다. 모든 변경은 동기 메서드라 방 큐 안에서 한 번에 하나씩 일어난다.
 */
export class SkillBook {
  private readonly inventories = new Map<number, SkillInventory>();
  private current: SkillSelection | null = null;
  private successes = 0;

  constructor(private readonly random: Random) {}

  get successCount(): number {
    return this.successes;
  }
  /** 선택 중이면 그 선택, 아니면 null. 게임은 선택 중에 일시정지한다. */
  get selection(): SkillSelection | null {
    return this.current;
  }
  inventory(userId: number): SkillHolding {
    return this.holding(userId);
  }

  /**
   * 종 성공(오발 제외)이 한 번 났다. 누적 횟수가 5의 배수면 `participants` 모두에게 선택을 열고 true를 돌려준다.
   * 게임을 시작할 때는 스킬을 주지 않으므로 호출하지 않는다.
   */
  recordSuccess(participants: SkillParticipant[], now: number): boolean {
    if (this.current) throw new Error('Skill selection is already open');
    this.successes++;
    if (this.successes % SKILL_PICK_EVERY !== 0) return false;
    this.current = new SkillSelection(
      new Map(
        participants.map(({ userId, role }) => [
          userId,
          { role, candidates: rollCandidates(role, this.random) },
        ]),
      ),
      now + SKILL_PICK_TIME_MS,
    );
    if (this.current.complete) this.current = null;
    return this.current !== null;
  }

  /**
   * 후보 칸 선택. 선택이 없거나 이미 골랐거나 시간이 끝난 뒤의 요청은 조용히 무시한다.
   * 선택 대상이 아니거나 값이 잘못되면 거부한다. 전원이 고르면 선택이 끝난다.
   */
  choose(userId: number, choice: SkillChoice, now: number): void {
    const selection = this.current;
    if (!selection) return;
    if (!selection.has(userId)) throw new SkillRuleError(ErrorCode.NOT_IN_ROOM);
    if (now >= selection.deadline || selection.hasChosen(userId)) return;
    const holding = this.holding(userId);
    if ('decline' in choice) {
      if (choice.decline !== true || !holding.isFull) throw invalid();
    } else {
      if (!validSlot(choice.slot)) throw invalid();
      if (holding.isFull) {
        if (!Number.isInteger(choice.replace) || !this.validReplace(choice.replace!))
          throw invalid();
      } else if (choice.replace !== undefined) throw invalid();
      const skillId = selection.candidates(userId)[choice.slot];
      if (holding.isFull) holding.replace(choice.replace!, skillId);
      else holding.add(skillId);
    }
    selection.markChosen(userId);
    if (selection.complete) this.current = null;
  }

  /**
   * 마감 시각이 지났으면 못 고른 사람을 처리하고 선택을 끝낸다. 끝났으면 true.
   * 빈 칸이 있으면 후보 중 하나를 무작위로 넣고, 가득 찼으면 받지 않은 것으로 본다(009-03).
   */
  settle(now: number): boolean {
    const selection = this.current;
    if (!selection || now < selection.deadline) return false;
    for (const userId of selection.pending()) {
      const holding = this.holding(userId);
      if (!holding.isFull) {
        const candidates = selection.candidates(userId);
        holding.add(candidates[pickIndex(this.random, candidates.length)]);
      }
      selection.markChosen(userId);
    }
    this.current = null;
    return true;
  }

  /** 탈락해 관전자가 됐다. 스킬만 사라지고 이후 선택에는 관전자로 계속 참여한다. */
  clear(userId: number): void {
    this.inventories.get(userId)?.clear();
  }

  /** 게임을 떠났다(이탈·퇴장). 스킬이 사라지고 진행 중인 선택 대상에서도 빠진다. */
  drop(userId: number): void {
    this.inventories.delete(userId);
    const selection = this.current;
    if (!selection) return;
    selection.remove(userId);
    if (selection.complete) this.current = null;
  }

  /** 안해(009-05): 종 성공 횟수와 모든 보유 스킬, 진행 중인 선택을 처음 상태로 돌린다. */
  reset(): void {
    this.inventories.clear();
    this.current = null;
    this.successes = 0;
  }

  private validReplace(slot: number): boolean {
    return slot >= 0 && slot < SKILL_SLOT_COUNT;
  }
  private holding(userId: number): SkillInventory {
    let inventory = this.inventories.get(userId);
    if (!inventory) {
      inventory = new SkillInventory();
      this.inventories.set(userId, inventory);
    }
    return inventory;
  }
}
