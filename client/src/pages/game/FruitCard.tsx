import type { Fruit } from '@nlmlio/shared';
import bananaIcon from '../../assets/game/banana.svg';
import limeIcon from '../../assets/game/lime.svg';
import plumIcon from '../../assets/game/plum.svg';
import strawberryIcon from '../../assets/game/strawberry.svg';
import { FRUIT_NAMES, type CardFace } from './game-view';

const FRUIT_ICONS: Record<Fruit, string> = {
  STRAWBERRY: strawberryIcon,
  BANANA: bananaIcon,
  LIME: limeIcon,
  PLUM: plumIcon,
};

/** 3×3 칸 중 과일이 들어가는 칸(왼쪽 위 0 → 오른쪽 아래 8). 주사위 눈과 같은 배치 */
const PIP_CELLS: Record<CardFace['count'], number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  // 과일 6개 카드: 두 줄 세 칸
  6: [0, 2, 3, 5, 6, 8],
};

/** 반짝반짝한 카드의 단계별 모양: 1 금색, 2 무지개, 3 우주 */
const SHINE = {
  1: { className: 'is-gilded', label: '금칠' },
  2: { className: 'is-rainbow', label: '무지개' },
  3: { className: 'is-cosmic', label: '우주' },
};

/** Night Line 카드: 어두운 카드에 과일을 선으로만 그린다 */
export function FruitCard({ card }: { card: CardFace }) {
  const cells = PIP_CELLS[card.count];
  const shine = card.sparkle ? SHINE[card.sparkle] : card.gilded ? SHINE[1] : undefined;
  return (
    <div
      className={`fruit-card${shine ? ` ${shine.className}` : ''}${card.boosted ? ' is-boosted' : ''}`}
      role="img"
      aria-label={`${FRUIT_NAMES[card.fruit]} ${card.count}${shine ? ` ${shine.label}` : ''}${card.boosted ? ' +1' : ''}`}
    >
      {card.sparkle && <span className="fruit-card-aurora" aria-hidden="true" />}
      {card.sparkle === 3 && <span className="fruit-card-stars" aria-hidden="true" />}
      {shine && <span className="fruit-card-shine" aria-hidden="true" />}
      {card.boosted && (
        <span className="fruit-card-plus" aria-hidden="true">
          +1
        </span>
      )}
      <div className="fruit-card-pips">
        {Array.from({ length: 9 }, (_, cell) => (
          <span key={cell} className="fruit-card-cell">
            {cells.includes(cell) && <img src={FRUIT_ICONS[card.fruit]} alt="" />}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EmptyCardSlot() {
  return <div className="fruit-card-slot" aria-hidden="true" />;
}
