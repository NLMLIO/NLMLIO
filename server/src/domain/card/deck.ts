import { Fruit } from '@nlmlio/shared';
import type { GameCard } from '@nlmlio/shared';

const INITIALS: Record<Fruit, string> = {
  STRAWBERRY: 'S',
  BANANA: 'B',
  LIME: 'L',
  PLUM: 'P',
};

export class Card {
  /** 반짝반짝한 카드: 꾸미기 표시일 뿐 판정에 영향이 없다. 테이블을 떠나면 사라진다 */
  private gold = false;
  constructor(
    readonly fruit: Fruit,
    readonly count: GameCard['count'],
    /** 과일 6개 카드(스킬): 판정으로 테이블을 떠나면 승자도 보관 스택도 아닌 곳으로 사라진다 */
    readonly special = false,
  ) {
    const max = special ? 6 : 5;
    if (
      !Object.values(Fruit).includes(fruit) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > max
    )
      throw new Error('Invalid card');
  }
  /** 과일 6개 카드: 이 과일의 6개짜리 특수 카드 */
  static six(fruit: Fruit): Card {
    return new Card(fruit, 6, true);
  }
  get gilded(): boolean {
    return this.gold;
  }
  gild(): void {
    this.gold = true;
  }
  ungild(): void {
    this.gold = false;
  }
  face(): GameCard {
    return {
      fruit: this.fruit,
      count: this.count,
      ...(this.special ? { special: true as const } : {}),
      ...(this.gold ? { gilded: true as const } : {}),
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
