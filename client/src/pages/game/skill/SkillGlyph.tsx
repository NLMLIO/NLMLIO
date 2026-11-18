import type { SkillId } from '@nlmlio/shared';
import { SKILL_GLYPH } from './skill-view';

/** 스킬 아이콘. 색은 부모의 `color`(등급 색)를 따른다. 크기는 CSS(.skill-glyph)가 정한다. */
export function SkillGlyph({ skillId }: { skillId: SkillId }) {
  const glyph = SKILL_GLYPH[skillId];
  if (glyph.kind === 'emoji')
    return (
      <span className="skill-glyph emoji" aria-hidden="true">
        {glyph.char}
      </span>
    );
  // Vite가 작은 SVG를 data URI로 인라인하므로 따옴표로 감싸야 url()이 유효하다.
  const mask = `url(${JSON.stringify(glyph.url)})`;
  return (
    <span
      className="skill-glyph icon"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      aria-hidden="true"
    />
  );
}
