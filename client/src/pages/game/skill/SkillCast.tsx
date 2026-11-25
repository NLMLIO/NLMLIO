import type { CSSProperties } from 'react';
import { skillById } from '@nlmlio/shared';
import { SkillGlyph } from './SkillGlyph';
import { GRADE_STYLE } from './skill-view';
import type { SkillCastView, SkillTargeting } from '../game-view';

/** 서버가 전달한 스킬 사용을 화면 위쪽에 1.6초 동안 표시하는 알림(Figma Skill Cast Banner) */
export function SkillCast({ cast }: { cast: SkillCastView }) {
  const skill = skillById(cast.skillId);
  return (
    <div
      key={cast.key}
      className="skill-cast"
      style={{ '--grade': GRADE_STYLE[skill.grade].color } as CSSProperties}
      role="status"
    >
      <span className="skill-cast-ring">
        <SkillGlyph skillId={cast.skillId} />
      </span>
      <span className="skill-cast-text">
        <small>{cast.caster} 님이 사용</small>
        <b>{skill.name}!</b>
      </span>
      {(cast.target || skill.announcement === 'field') && (
        <span className="skill-cast-target">
          {cast.reflectedBy?.length
            ? `🌈 ${cast.reflectedBy.join('·')} 반사 → `
            : cast.target
              ? '→ '
              : ''}
          {cast.target ?? '필드 전체'}
        </span>
      )}
    </div>
  );
}

/** 대상 지정 스킬을 골랐을 때 화면 아래에 뜨는 안내. 좌석을 눌러 대상을 고른다 */
export function SkillTargetHint({ targeting }: { targeting: SkillTargeting }) {
  const skill = skillById(targeting.skillId);
  return (
    <p
      className="skill-hint"
      style={{ '--grade': GRADE_STYLE[skill.grade].color } as CSSProperties}
      role="status"
    >
      <b>{skill.name}</b>
      <span>대상 한 명을 눌러 고르세요 · Esc 취소</span>
    </p>
  );
}
