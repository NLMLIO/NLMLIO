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

/** 폭발의 불씨가 튀는 방향(도) */
const SPARKS = [8, 42, 71, 108, 139, 172, 205, 236, 268, 301, 333];
/** 연기 덩어리가 퍼지는 자리 */
const SMOKE = [
  [-90, -80],
  [95, -60],
  [-60, 70],
  [70, 85],
  [0, -130],
];

/** 지뢰가 터지는 종: 섬광·불덩이·충격파와 함께 종 파편·불씨·연기가 사방으로 퍼진다 */
export function BellBlast({ at }: { at: Point }) {
  return (
    <div className="bell-blast" style={{ left: at.x, top: at.y }} role="img" aria-label="종 폭발">
      <i className="blast-flash" />
      <i className="blast-fire" />
      <i className="blast-ring" />
      <i className="blast-ring late" />
      {SMOKE.map(([x, y]) => (
        <i
          key={`${x},${y}`}
          className="blast-smoke"
          style={{ '--sx': `${x}px`, '--sy': `${y}px` } as CSSProperties}
        />
      ))}
      {fragments.map(([polygon, dx, dy, spin]) => (
        <i
          key={polygon}
          className="blast-piece"
          style={
            {
              backgroundImage: `url("${bell}")`,
              clipPath: `polygon(${polygon})`,
              '--dx': `${dx * 6}px`,
              '--dy': `${dy * 6}px`,
              '--spin': `${spin * 9}deg`,
            } as CSSProperties
          }
        />
      ))}
      {SPARKS.map((angle) => (
        <i
          key={angle}
          className="blast-spark"
          style={{ '--angle': `${angle}deg` } as CSSProperties}
        />
      ))}
    </div>
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
  const destination = target ?? { x: 550, y: 440 };
  const travel = (from: Point, to: Point) =>
    ({
      left: to.x,
      top: to.y,
      '--from-x': `${from.x - to.x}px`,
      '--from-y': `${from.y - to.y}px`,
    }) as CSSProperties;
  // 반사됐으면 쓴 사람 → 원래 대상(첫 반사자) → … → 실제로 맞는 사람 순서의 길을 따라간다.
  const route = [start, ...reflectors, destination];
  const hopMs = Math.min(520, Math.floor(1500 / (route.length - 1)));
  const projectiles = () =>
    reflectors.length ? (
      route.slice(1).map((to, index) => (
        <i
          key={index}
          className={`skill-projectile cue-${cast.skillId.toLowerCase()} hop`}
          style={{
            ...travel(route[index], to),
            animationDelay: `${index * hopMs}ms`,
            animationDuration: `${hopMs}ms`,
          }}
        >
          {cast.skillId === SkillId.HAND_SMASH ? '👊' : null}
        </i>
      ))
    ) : (
      <i
        className={`skill-projectile cue-${cast.skillId.toLowerCase()}`}
        style={travel(start, destination)}
      />
    );
  let effect;
  switch (cast.skillId) {
    case SkillId.RESET:
    case SkillId.DORMAMMU:
      effect = <RewindCards reset={cast.skillId === SkillId.RESET} />;
      break;
    case SkillId.SPIT:
    case SkillId.AMATERASU:
    case SkillId.HACK:
      effect = projectiles();
      break;
    case SkillId.HAND_SMASH:
      // 반사되지 않은 내려치기는 대상 손의 충격 연출만 쓴다.
      if (reflectors.length) effect = projectiles();
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
          // 날아온 것이 그 사람에게 닿을 때 반사 고리가 뜬다.
          style={{ left: point.x, top: point.y, animationDelay: `${(index + 1) * hopMs - 120}ms` }}
        />
      ))}
    </div>
  );
}
