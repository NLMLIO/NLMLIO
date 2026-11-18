import type { CSSProperties } from 'react';
import { skillById } from '@nlmlio/shared';
import { SkillGlyph } from './SkillGlyph';
import { GRADE_STYLE } from './skill-view';
import type { SkillCastView, SkillTargeting } from '../game-view';

/** 스킬을 쓰면 모두의 화면 위쪽 가운데에 1.6초 동안 뜨는 알림(Figma Skill Cast Banner) */
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
      <span className="skill-cast-target">{cast.target ? `→ ${cast.target}` : '전원'}</span>
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
