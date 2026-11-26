import type { CSSProperties } from 'react';
import '../../../styles/roulette-impact.css';

/** 불씨가 튀는 방향(도) */
const SPARKS = [5, 38, 66, 97, 131, 160, 196, 224, 258, 289, 322, 350];
/** 피격 지점에서 연기가 퍼지는 자리 */
const SMOKE = [
  [-55, -50],
  [60, -35],
  [-10, -85],
];

/**
 * 러시안 룰렛 실탄(FUNC-009-05)이 맞은 자리의 연출: 폭발 섬광·충격파·총알 자국·불씨·연기와 화면 번쩍임.
 * `self`(내가 맞음)면 보드 가장자리가 붉게 물든다. 총알이 날아가 닿는 시각에 맞춰 시작해 판정 표시 안에 끝난다.
 */
export function RouletteImpact({ at, self }: { at: { x: number; y: number }; self: boolean }) {
  return (
    <>
      <div className="shot-screen" aria-hidden="true" />
      {self && <div className="shot-hurt" aria-hidden="true" />}
      <div className="shot-impact" style={{ left: at.x, top: at.y }} aria-hidden="true">
        <i className="shot-burst" />
        <i className="shot-ring" />
        <i className="shot-ring late" />
        {SMOKE.map(([x, y]) => (
          <i
            key={`${x},${y}`}
            className="shot-smoke"
            style={{ '--sx': `${x}px`, '--sy': `${y}px` } as CSSProperties}
          />
        ))}
        <svg className="shot-hole" viewBox="-100 -100 200 200">
          {/* 금 간 자국과 총알 구멍 */}
          <path d="M0 0 18 -22 14 -34 31 -62M0 0 34 -6 47 5 78 -4M0 0 22 27 19 44 38 66M0 0 -10 33 -29 45 -33 74M0 0 -35 8 -52 -4 -82 9M0 0 -22 -27 -45 -34 -56 -58M0 0 -2 -38 8 -52 2 -80" />
          <circle className="shot-hole-rim" r="17" />
          <circle className="shot-hole-core" r="10" />
        </svg>
        {SPARKS.map((angle) => (
          <i
            key={angle}
            className="shot-spark"
            style={{ '--angle': `${angle}deg` } as CSSProperties}
          />
        ))}
      </div>
    </>
  );
}
