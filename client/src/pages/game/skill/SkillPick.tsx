import { useState } from 'react';
import { SKILL_PICK_EVERY } from '@nlmlio/shared';
import { SkillCard } from './SkillCard';
import { SkillSlot } from './SkillSlot';
import { SLOT_KEYS, clock, firstEmptySlot, isFull } from './skill-view';
import type { SkillPickHandler, SkillPickView, SkillSlotView } from './skill-view';

/**
 * 종 성공 5번마다 뜨는 스킬 선택 창(Figma 21 · 21-1, FUNC-009-01~03). 게임 화면 전체(1440×900)를 덮는다.
 * 후보 3칸은 서버가 정해서 보내고, 여기서는 고른 칸을 «의도»로만 보낸다. 칸이 가득 차 있으면 바꿀 칸을 함께 고르거나 받지 않는다.
 */
export function SkillPick({
  pick,
  slots,
  onChoose,
}: {
  pick: SkillPickView;
  slots: SkillSlotView[];
  onChoose: SkillPickHandler;
}) {
  const spectator = pick.role === 'spectator';
  const full = isFull(slots);
  const next = firstEmptySlot(slots);
  const finished = pick.chosenCandidate !== null || pick.declined;
  const [replace, setReplace] = useState<number | null>(null);
  const filled = slots.filter((slot) => slot.skillId !== null).length;

  function buttonFor(index: number) {
    if (pick.chosenCandidate === index) {
      const slot = pick.placedSlot ?? (full ? null : next);
      return {
        className: 'primary',
        label: slot === null ? '선택됨' : `선택됨 · ${SLOT_KEYS[slot]} 칸에 넣기`,
        disabled: true,
      };
    }
    if (full && !finished)
      return {
        className: 'secondary',
        label: replace === null ? '선택' : `선택 · ${SLOT_KEYS[replace]} 칸과 교체`,
        disabled: replace === null,
      };
    return { className: 'secondary', label: '선택', disabled: finished };
  }

  function choose(index: number) {
    if (full) {
      if (replace === null) return;
      onChoose({ slot: index, replace });
    } else onChoose({ slot: index });
  }

  return (
    <div className="skill-pick" role="dialog" aria-modal="true" aria-labelledby="skill-pick-title">
      <p className="skill-pick-progress">
        {spectator ? '관전자' : '다른 플레이어'} {pick.progress.done} / {pick.progress.total} 선택
        완료
      </p>
      <p className="skill-pick-timer">
        <span>남은 시간</span>
        <b>{clock(pick.secondsLeft)}</b>
      </p>
      <p className="skill-pick-eyebrow">
        SUCCESS {pick.successCount} · {spectator ? 'SPECTATOR ' : ''}SKILL PICK {pick.pickNo}
      </p>
      <h2 id="skill-pick-title" className="skill-pick-title">
        스킬을 하나 고르세요
      </h2>
      <p className="skill-pick-sub">
        {spectator
          ? `관전자도 종 성공 ${SKILL_PICK_EVERY}번마다 관전자용 스킬 하나를 골라요. 같은 스킬이 여러 장 나올 수 있어요.`
          : full
            ? '칸이 가득 찼어요. 바꿀 칸을 누르고 스킬을 고르거나, 받지 않을 수 있어요. 10초가 지나면 받지 않아요.'
            : `종 성공 ${SKILL_PICK_EVERY}번마다 스킬 3개가 나와요. 하나를 골라 빈 칸에 넣어요. 10초 안에 안 고르면 무작위로 들어가요.`}
      </p>
      <div className="skill-pick-cards">
        {pick.candidates.map((skillId, index) => {
          const selected = pick.chosenCandidate === index;
          const button = buttonFor(index);
          return (
            <div key={index} className="skill-pick-column" data-selected={selected || undefined}>
              <SkillCard skillId={skillId} selected={selected} />
              <button
                type="button"
                className={`skill-pick-button ${button.className}`}
                disabled={button.disabled}
                onClick={() => choose(index)}
              >
                {button.label}
              </button>
            </div>
          );
        })}
      </div>
      <section className="skill-pick-dock" aria-label="내 스킬">
        <div className="skill-pick-dock-title">
          <p>내 스킬</p>
          <p>
            {filled} / {slots.length}
          </p>
        </div>
        {slots.map((slot, index) => (
          <SkillSlot
            key={index}
            index={index}
            slot={slot}
            next={!full && index === next}
            target={full && replace === index}
            onClick={full && !finished ? () => setReplace(index) : undefined}
          />
        ))}
        {full && !finished ? (
          <button
            type="button"
            className="skill-pick-button secondary small"
            onClick={() => onChoose({ decline: true })}
          >
            받지 않기
          </button>
        ) : (
          <p className="skill-pick-dock-note">
            {pick.declined
              ? '이번 스킬은 받지 않았어요'
              : `종 성공 ${SKILL_PICK_EVERY}번마다 하나씩 · 한 번 쓰면 그 칸은 비어요`}
          </p>
        )}
      </section>
    </div>
  );
}
