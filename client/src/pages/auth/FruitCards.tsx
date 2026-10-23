// 로그인 화면 왼쪽 장식: 과일 카드 3장. 직접 그린 SVG라 외부 리소스가 없다.
type Fruit = 'strawberry' | 'lime' | 'plum';

const CARDS: { fruit: Fruit; count: 2 | 3 | 5 }[] = [
  { fruit: 'strawberry', count: 5 },
  { fruit: 'lime', count: 3 },
  { fruit: 'plum', count: 2 },
];

// 카드 안 과일 위치(%) — 주사위 눈처럼 배치
const LAYOUTS: Record<2 | 3 | 5, [number, number][]> = {
  2: [
    [32, 28],
    [68, 72],
  ],
  3: [
    [28, 26],
    [50, 50],
    [72, 74],
  ],
  5: [
    [28, 24],
    [72, 24],
    [50, 50],
    [28, 76],
    [72, 76],
  ],
};

function FruitIcon({ fruit }: { fruit: Fruit }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round">
      {fruit === 'strawberry' && (
        <>
          <path d="M12 21c-4-2.4-7-6-7-10 0-2.4 1.8-4 4-4h6c2.2 0 4 1.6 4 4 0 4-3 7.6-7 10z" />
          <path d="M8.5 7 12 4.5 15.5 7M12 4.5V2.5" />
          <path d="M10 11h.01M14 11h.01M12 14.5h.01" strokeWidth="2.6" />
        </>
      )}
      {fruit === 'lime' && (
        <>
          <path d="M3.5 13.5a8.5 8.5 0 0 0 17 0z" />
          <path d="M12 13.5v7.5M12 13.5l-5.6 5.4M12 13.5l5.6 5.4" />
        </>
      )}
      {fruit === 'plum' && (
        <>
          <circle cx="12" cy="13.5" r="7.5" />
          <path d="M12 6c0-1.8 1-3 3-3.5M12 6c-1.6-1.4-3.6-1.4-4.6-.4 1.1 1.4 3 1.5 4.6.4" />
        </>
      )}
    </svg>
  );
}

export function FruitCards() {
  return (
    <div className="fruit-cards" aria-hidden="true">
      {CARDS.map(({ fruit, count }) => (
        <div key={fruit} className={`fruit-card ${fruit}`}>
          {LAYOUTS[count].map(([x, y]) => (
            <span key={`${x}-${y}`} style={{ left: `${x}%`, top: `${y}%` }}>
              <FruitIcon fruit={fruit} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
