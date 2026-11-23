import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import arcadeBlaster from '../../../assets/skills/arcade-blaster.svg';

type Point = { x: number; y: number };

/** 조준점은 피격자의 아바타, 돌아오는 카드는 그 사람의 실제 덱에 맞춘다. */
export function SkillShot({
  center,
  at,
  targetId,
  targetName,
  movedCards,
}: {
  center: Point;
  at: Point;
  targetId: string;
  targetName: string;
  movedCards?: number;
}) {
  const scene = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = scene.current;
    const board = layer?.parentElement;
    if (!layer || !board) return;
    const player = board.querySelector(`[data-player-id="${CSS.escape(targetId)}"]`);
    const deck = player?.querySelector('.deck-icon') ?? board.querySelector('.my-deck');
    const boardBox = board.getBoundingClientRect();
    const scale = boardBox.width / board.offsetWidth;
    if (!scale) return;
    const position = (element: Element | null) => {
      if (!element) return at;
      const rect = element.getBoundingClientRect();
      return {
        x: (rect.x + rect.width / 2 - boardBox.x) / scale,
        y: (rect.y + rect.height / 2 - boardBox.y) / scale,
      };
    };
    const target = position(player?.querySelector('.player-avatar') ?? deck);
    const source = position(deck);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const degrees = Math.atan2(dy, dx) * (180 / Math.PI);
    layer.style.setProperty('--aim', `${degrees}deg`);
    // 조준 전에는 위를 본다. 어느 좌석으로 쏘든 짧은 쪽으로 돈다.
    layer.style.setProperty('--initial-aim', degrees > 90 ? '270deg' : '-90deg');
    layer.style.setProperty('--range', `${Math.hypot(dx, dy)}px`);
    layer.style.setProperty('--target-x', `${dx}px`);
    layer.style.setProperty('--target-y', `${dy}px`);
    layer.style.setProperty('--deck-x', `${source.x - center.x}px`);
    layer.style.setProperty('--deck-y', `${source.y - center.y}px`);
  }, [targetId, center.x, center.y, at.x, at.y]);

  return (
    <div className="roulette-scene" ref={scene} style={{ left: center.x, top: center.y }}>
      <div className="roulette-fx" aria-hidden="true">
        <span className="roulette-axis">
          <span className="roulette-gun">
            <img src={arcadeBlaster} alt="" />
            <i className="roulette-flash" />
          </span>
          <i className="roulette-tracer" />
        </span>
        <i className="roulette-hit" />
        {Array.from({ length: movedCards ?? 0 }, (_, index) => (
          <i
            key={index}
            className="roulette-card"
            style={{ '--card-delay': `${index * 47}ms` } as CSSProperties}
          />
        ))}
      </div>
      <span className="roulette-result" role="status">
        {targetName} 피격{movedCards !== undefined && ` · 덱 −${movedCards}장`}
      </span>
    </div>
  );
}
