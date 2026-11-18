import type { CSSProperties } from 'react';
import { skillById } from '@nlmlio/shared';
import { SkillGlyph } from './SkillGlyph';
import { GRADE_STYLE, SLOT_KEYS } from './skill-view';
import type { SkillSlotView } from './skill-view';

/**
 * 스킬 슬롯 한 칸(Figma Skill Slot). 사용하면 사라지고, 쓸 수 없는 시점이면 흐리게 보인다.
 * `next`는 다음 스킬이 들어갈 빈 칸(라임 점선), `target`은 교체할 칸으로 고른 상태다.
 */
export function SkillSlot({
  index,
  slot,
  next = false,
  target = false,
  onClick,
}: {
  index: number;
  slot: SkillSlotView;
  next?: boolean;
  target?: boolean;
  onClick?: () => void;
}) {
  const skill = slot.skillId ? skillById(slot.skillId) : null;
  const color = skill ? GRADE_STYLE[skill.grade].color : undefined;
  const state = skill ? (slot.usable ? 'ready' : 'idle') : next ? 'next' : 'empty';
  return (
    <div className="skill-slot" data-state={state} data-target={target || undefined}>
      <button
        type="button"
        className="skill-slot-button"
        style={color ? ({ '--grade': color } as CSSProperties) : undefined}
        disabled={!onClick}
        aria-label={
          skill ? `${SLOT_KEYS[index]} 칸 · ${skill.name}` : `${SLOT_KEYS[index]} 칸 · 빈 칸`
        }
        aria-pressed={target || undefined}
        onClick={onClick}
      >
        {slot.skillId ? <SkillGlyph skillId={slot.skillId} /> : <span className="plus">+</span>}
      </button>
      <kbd className="skill-slot-key">{SLOT_KEYS[index]}</kbd>
    </div>
  );
}

/** 게임 화면 내 상태 바 오른쪽에 붙는 스킬 슬롯 묶음(Figma Skill Dock) */
export function SkillDock({ slots }: { slots: SkillSlotView[] }) {
  return (
    <section className="skill-dock" aria-label="내 스킬">
      {slots.map((slot, index) => (
        <SkillSlot key={index} index={index} slot={slot} />
      ))}
    </section>
  );
}
