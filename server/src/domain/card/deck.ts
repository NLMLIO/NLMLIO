import { Fruit, SPARKLE_MAX_STACK } from '@nlmlio/shared';
import type { GameCard } from '@nlmlio/shared';

const INITIALS: Record<Fruit, string> = {
  STRAWBERRY: 'S',
  BANANA: 'B',
  LIME: 'L',
  PLUM: 'P',
};

export class Card {
  /** 반짝반짝한 카드의 겹친 횟수(0이면 없음). 꾸미기 표시일 뿐 판정에 영향이 없고, 테이블을 떠나면 사라진다 */
  private shine = 0;
  /** 숫자 바꾸기: 과일 개수가 1 늘어난 동안 true. 카드가 테이블을 떠나면 원래대로 돌아온다 */
  private plusOne = false;
  constructor(
    readonly fruit: Fruit,
    private readonly base: GameCard['count'],
    /** 과일 6개 카드(스킬): 판정으로 테이블을 떠나면 승자도 보관 스택도 아닌 곳으로 사라진다 */
    readonly special = false,
  ) {
    const max = special ? 6 : 5;
    if (!Object.values(Fruit).includes(fruit) || !Number.isInteger(base) || base < 1 || base > max)
      throw new Error('Invalid card');
  }
  /** 판정에 쓰이는 과일 개수(숫자 바꾸기가 걸렸으면 1 늘어난 값) */
  get count(): GameCard['count'] {
    return (this.base + (this.plusOne ? 1 : 0)) as GameCard['count'];
  }
  get boosted(): boolean {
    return this.plusOne;
  }
  /** 숫자 바꾸기를 걸 수 있나: 특수 카드가 아니고, 이미 걸리지 않았고, 6개를 넘지 않는다 */
  get canBoost(): boolean {
    return !this.special && !this.plusOne && this.base < 6;
  }
  boost(): void {
    if (!this.canBoost) throw new Error('Card cannot be boosted');
    this.plusOne = true;
  }
  unboost(): void {
    this.plusOne = false;
  }
  /** 과일 6개 카드: 이 과일의 6개짜리 특수 카드 */
  static six(fruit: Fruit): Card {
    return new Card(fruit, 6, true);
  }
  /** 겹친 횟수: 0 없음, 1 금색, 2 무지개, 3 우주 */
  get shineLevel(): number {
    return this.shine;
  }
  gild(level = 1): void {
    if (!Number.isInteger(level) || level < 1 || level > SPARKLE_MAX_STACK)
      throw new Error('Invalid sparkle level');
    this.shine = level;
  }
  ungild(): void {
    this.shine = 0;
  }
  face(): GameCard {
    return {
      fruit: this.fruit,
      count: this.count,
      ...(this.special ? { special: true as const } : {}),
      ...(this.plusOne ? { boosted: true as const } : {}),
      ...(this.shine ? { gilded: true as const } : {}),
      ...(this.shine > 1 ? { sparkle: this.shine as 2 | 3 } : {}),
    };
  }
  code(): string {
    return `${INITIALS[this.fruit]}${this.count}${this.special ? '*' : ''}`;
  }
}

export class Deck {
  private readonly cards: Card[];
  constructor(cards: readonly Card[]) {
    this.cards = [...cards];
  }
  static standard(): Deck {
    return new Deck(
      Object.values(Fruit).flatMap((fruit) =>
        [5, 3, 3, 2, 1].flatMap((copies, index) =>
          Array.from({ length: copies }, () => new Card(fruit, (index + 1) as GameCard['count'])),
        ),
      ),
    );
  }
  shuffle(random: () => number): Deck {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid randomness');
      const j = Math.floor(value * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }
  deal(count: number): { hands: Card[][]; remainder: Card[] } {
    if (!Number.isInteger(count) || count < 2 || count > 6) throw new Error('Invalid player count');
    const size = Math.floor(this.cards.length / count);
    if (size < 1) throw new Error('Not enough cards');
    const hands = Array.from({ length: count }, () => [] as Card[]);
    for (let i = 0; i < size * count; i++) hands[i % count].push(this.cards[i]);
    return { hands, remainder: this.cards.slice(size * count) };
  }
}
