import type { CSSProperties } from 'react';
import { SkillId } from '@nlmlio/shared';
import bell from '../../../assets/game/bell.svg';
import fist from '../../../assets/skills/fist.svg';
import type { SkillCastView } from '../game-view';

type Point = { x: number; y: number };

export function FistImpact() {
  return (
    <span className="fist-impact" aria-hidden="true">
      <img className="impact-fist" src={fist} alt="" />
      <i className="impact-burst" />
      <i className="impact-wave" />
    </span>
  );
}

/** Clip the original bell into adjoining fragments so the object hit is the object that breaks. */
const fragments = [
  ['0 0, 49% 0, 46% 25%, 54% 37%, 42% 50%, 0 29%', -22, -33, -24],
  ['49% 0, 100% 0, 100% 33%, 70% 42%, 54% 37%, 46% 25%', 18, -30, 19],
  ['0 29%, 42% 50%, 33% 63%, 0 77%', -42, 2, -33],
  ['42% 50%, 54% 37%, 70% 42%, 61% 62%, 45% 72%, 33% 63%', 4, 16, 39],
  ['70% 42%, 100% 33%, 100% 80%, 61% 62%', 38, 13, 30],
  ['0 77%, 33% 63%, 45% 72%, 50% 100%, 0 100%', -17, 28, -22],
  ['45% 72%, 61% 62%, 100% 80%, 100% 100%, 50% 100%', 21, 34, 20],
] as const;

export function BrokenBell({ strike }: { strike: boolean }) {
  return (
    <span className={`broken-bell-pieces${strike ? ' on-impact' : ''}`} aria-hidden="true">
      {fragments.map(([polygon, dx, dy, spin]) => (
        <i
          key={polygon}
          className="bell-fragment"
          style={
            {
              backgroundImage: `url("${bell}")`,
              clipPath: `polygon(${polygon})`,
              '--dx': `${dx}px`,
              '--dy': `${dy}px`,
              '--spin': `${spin}deg`,
            } as CSSProperties
          }
        />
      ))}
      {strike && (
        <>
          <FistImpact />
          <b className="bell-impact-word">꽝!!</b>
        </>
      )}
    </span>
  );
}

function RewindCards({ reset }: { reset: boolean }) {
  return (
    <span className={`skill-deck-motion ${reset ? 'is-reset' : 'is-rewinding'}`}>
      {[-2, -1, 0, 1, 2].map((index) => (
        <i
          key={index}
          style={{ '--index': index, '--delay': `${(index + 2) * 55}ms` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** Cues use only the cast delivered to this viewer. The target anchor follows the seat layout. */
export function SkillMotion({
  cast,
  caster,
  target,
  reflectors,
}: {
  cast: SkillCastView;
  caster: Point | null;
  target: Point | null;
  /** 무지개 반사로 막아 낸 사람들의 자리(막은 순서). 첫 사람이 원래 대상이다 */
  reflectors: Point[];
}) {
  const start = caster ?? { x: 990, y: 80 };
  const reflector = reflectors[0];
  const destination = reflector ?? target ?? { x: 550, y: 440 };
  const travel = {
    left: destination.x,
    top: destination.y,
    '--from-x': `${start.x - destination.x}px`,
    '--from-y': `${start.y - destination.y}px`,
  } as CSSProperties;
  let effect;
  switch (cast.skillId) {
    case SkillId.RESET:
    case SkillId.DORMAMMU:
      effect = <RewindCards reset={cast.skillId === SkillId.RESET} />;
      break;
    case SkillId.SPIT:
    case SkillId.AMATERASU:
    case SkillId.HACK:
      effect = (
        <i
          className={`skill-projectile cue-${cast.skillId.toLowerCase()}${reflector ? ' reflected' : ''}`}
          style={travel}
        />
      );
      break;
    case SkillId.SIX_FRUIT_CARD:
    case SkillId.NUMBER_SHIFT:
    case SkillId.SPARKLE_CARD:
      effect = (
        <i
          className={`skill-card-charge cue-${cast.skillId.toLowerCase()}`}
          style={{ left: start.x, top: start.y }}
        >
          {cast.skillId === SkillId.SIX_FRUIT_CARD
            ? '6'
            : cast.skillId === SkillId.NUMBER_SHIFT
              ? '+1'
              : '✦'}
        </i>
      );
      break;
  }
  return (
    <div className="skill-motion" aria-hidden="true">
      {effect}
      {reflectors.map((point, index) => (
        <i
          key={index}
          className="reflect-arc"
          style={{ left: point.x, top: point.y, animationDelay: `${index * 180}ms` }}
        />
      ))}
    </div>
  );
}
