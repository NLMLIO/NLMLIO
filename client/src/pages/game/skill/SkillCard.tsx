import type { CSSProperties } from 'react';
import { skillById } from '@nlmlio/shared';
import type { SkillId } from '@nlmlio/shared';
import { SkillGlyph } from './SkillGlyph';
import { GRADE_STYLE, TIMING_LABEL, USER_LABEL, gradeStars } from './skill-view';

/** 스킬 선택 창의 카드(Figma Skill Card). 선택되면 테두리 라임 + 체크 표시 */
export function SkillCard({ skillId, selected = false }: { skillId: SkillId; selected?: boolean }) {
  const skill = skillById(skillId);
  const grade = GRADE_STYLE[skill.grade];
  return (
    <article
      className={`skill-card${selected ? ' is-selected' : ''}`}
      style={{ '--grade': grade.color } as CSSProperties}
      aria-label={`${skill.name} ${grade.name}`}
    >
      <span className="skill-card-band" />
      <span className="skill-card-glow" />
      <div className="skill-card-top">
        <span className="skill-card-ring">
          <SkillGlyph skillId={skillId} />
        </span>
        <div className="skill-card-grade">
          <p>{grade.name}</p>
          <p className="stars">{gradeStars(skill.grade)}</p>
        </div>
      </div>
      {selected && (
        <span className="skill-card-check" aria-hidden="true">
          ✓
        </span>
      )}
      <h3 className="skill-card-name">{skill.name}</h3>
      <div className="skill-card-chips">
        <span>{TIMING_LABEL[skill.timing]}</span>
        <span>{USER_LABEL[skill.user]}</span>
      </div>
      <p className="skill-card-text">{skill.description}</p>
    </article>
  );
}
