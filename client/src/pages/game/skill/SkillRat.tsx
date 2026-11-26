import type { CSSProperties } from 'react';
import type { RatView } from '../game-view';
import '../../../styles/skill-rat.css';

type Point = { x: number; y: number };

/** Each tile uses the same dark back and lime ring as the player's deck. */
function CardStack({ count }: { count: number }) {
  const layers = Math.min(count, 5);
  return (
    <g className="rat-cargo">
      {Array.from({ length: layers }, (_, i) => (
        <g
          key={i}
          transform={`rotate(${(layers - i - 1) * 2.8 - 5} 68 24) translate(0 ${(layers - i - 1) * 1.6})`}
        >
          <rect
            x="26"
            y="6"
            width="79"
            height="45"
            rx="4"
            fill="#292a34"
            stroke="#a2bd2f"
            strokeWidth="1.4"
          />
          {i === layers - 1 && (
            <g fill="none" strokeWidth="1">
              <rect x="29.5" y="9.5" width="72" height="38" rx="2" stroke="#535363" />
              <circle cx="65.5" cy="28.5" r="8" stroke="#b8e026" />
            </g>
          )}
        </g>
      ))}
    </g>
  );
}

function Mouse({ cards }: { cards: number }) {
  return (
    <svg className="rat-mouse" viewBox="0 0 140 154" aria-hidden="true">
      <g stroke="#13141c" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M51 119c-13 12-20 12-28 7s-12-3-14 2"
          fill="none"
          stroke="#a37e95"
          strokeWidth="2.7"
        />
        <g className="rat-shoe rat-back-shoe">
          <path d="m61 116-2 14-14 5 4 8 21-4 9-18z" fill="#286b90" />
          <path d="M59 130c-8-3-10-1-13 1-5 1-9 3-9 6 0 5 15 6 23-1z" fill="#379fce" />
          <path d="M41 139c4 2 11 2 16 0" fill="none" stroke="#a0e5fa" strokeWidth="1.4" />
        </g>
        <g className="rat-shoe rat-front-shoe">
          <path d="m73 119 14 13 12 4 5-7-18-16z" fill="#319cce" />
          <path d="M93 130c8-2 16 1 18 5 1 4-2 6-8 7-6 1-10-1-14-5z" fill="#348dc2" />
          <path d="M95 140q8 3 13-1" fill="none" stroke="#a0e5fa" strokeWidth="1.4" />
        </g>
        <path
          d="M55 87c2-10 10-12 19-11 15 4 23 19 24 36l-3 8c-11 1-26 6-43 9-6-2-10-13-9-23z"
          fill="#f28b2b"
        />
        <path
          d="M52 109q13-2 31-9c5 13-4 23-13 24-7 0-13-5-18-15Z"
          fill="#f29a38"
          strokeWidth="2"
        />
        <path d="M54 103q7-7 14-4" fill="none" stroke="#ffc781" strokeWidth="2.2" />
        <path d="m51 83 26-10 5 14q-12 8-28 9z" fill="#f9a446" />
        <path d="m58 88 2 6m5-9 3 7m4-11 3 7" fill="none" stroke="#d37c25" strokeWidth="1.3" />
        <circle cx="39" cy="60" r="13" fill="#7a7e8d" />
        <circle cx="39" cy="60" r="8.2" fill="#ff9baf" strokeWidth="1.2" />
        <circle cx="91" cy="48" r="13" fill="#7a7e8d" />
        <circle cx="91" cy="48" r="8.1" fill="#ff9baf" strokeWidth="1.2" />
        <path
          d="M43 56c4-13 17-21 32-20 12 0 22 8 23 21 1 14-12 28-27 32-10 1-19-2-26-9-5-6-5-16-2-24Z"
          fill="#757986"
        />
        <path d="M49 58q5-8 12-6" fill="none" stroke="#b5b8c4" strokeWidth="2.3" />
        <g fill="#87ec9b" strokeWidth="1.7">
          <circle cx="57" cy="63" r="4.3" />
          <circle cx="79" cy="57" r="4" />
        </g>
        <g fill="#1c2830" stroke="none">
          <circle cx="57" cy="63" r="2.5" />
          <circle cx="79" cy="57" r="2.3" />
        </g>
        <g fill="#fff" stroke="none">
          <circle cx="56" cy="61.6" r="1" />
          <circle cx="78.3" cy="55.9" r="1" />
        </g>
        <path d="M62 70c3-3 11-5 17-5q4 2-1 5c-6 3-16 5-16 0Z" fill="#ff8ca0" strokeWidth="1.8" />
        <path d="M67 68.5q3-1.7 7-1.8" fill="none" stroke="white" strokeWidth="1.2" />
        <path d="M61 78q13 6 22-8" fill="none" strokeWidth="1.7" />
        <path d="m66 78 8-2 1.3 5-8 2.2z" fill="#fff" strokeWidth="1.2" />
        <path d="m70 77.4 1.1 4" fill="none" strokeWidth="1" />
        <path d="m49 76-15-3m16 3-12 4m49-14 11-7m-11 7 14-2" fill="none" strokeWidth="1.05" />
        <g className="rat-arms">
          <path d="M48 93C35 84 30 65 30 46q0-6 4-6t4 6c-1 18 4 31 15 42q3 5-1 7z" fill="#f38e32" />
          <path d="M83 85q13-23 4-46-2-5 2-7 4-1 6 5c8 22 6 39-5 52q-5 3-7-4z" fill="#f38e32" />
          <path d="M28 46c-2-2-3-7-1-9s4 0 5 2q3-3 5 0t-1 6z" fill="#9295a1" strokeWidth="1.8" />
          <path d="M88 37q-5-6-1-10 3-2 5 2 3-2 5 1 1 4-3 7z" fill="#9295a1" strokeWidth="1.8" />
        </g>
        <CardStack count={cards} />
      </g>
    </svg>
  );
}

export function SkillRat({ rat, bell, seat }: { rat: RatView; bell: Point; seat: Point | null }) {
  const origin = { x: bell.x + 56, y: bell.y + 108 };
  const style = {
    left: origin.x,
    top: origin.y,
    '--rat-dx': `${(seat?.x ?? origin.x) - origin.x}px`,
    '--rat-dy': `${(seat?.y ?? origin.y) - origin.y}px`,
  } as CSSProperties;
  return (
    <div className={`rat-effect rat-${rat.phase}`} style={style} role="status">
      <div className="rat-path">
        <div className="rat-actor">
          <Mouse cards={rat.cardCount} />
        </div>
      </div>
      {rat.phase === 'stolen' && <b className="rat-reward">덱 +{rat.cardCount}</b>}
      {rat.phase === 'crushed' && <b className="rat-squeak">찍!</b>}
      {rat.phase === 'mined' && <span aria-hidden="true" className="rat-blast" />}
      {rat.phase === 'missed' && (
        <span className="rat-missed-message">보관 카드가 먼저 사라졌어요</span>
      )}
      {rat.phase === 'waiting' && (
        <span className="rat-sr">쥐가 종 아래에서 카드를 들고 있어요</span>
      )}
    </div>
  );
}
