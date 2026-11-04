import { Fruit } from '@nlmlio/shared';
import type { GameCard } from '@nlmlio/shared';

const INITIALS: Record<Fruit, string> = {
  STRAWBERRY: 'S',
  BANANA: 'B',
  LIME: 'L',
  PLUM: 'P',
};

export class Card {
  constructor(
    readonly fruit: Fruit,
    readonly count: GameCard['count'],
  ) {
    if (!Object.values(Fruit).includes(fruit) || !Number.isInteger(count) || count < 1 || count > 5)
      throw new Error('Invalid card');
  }
  face(): GameCard {
    return { fruit: this.fruit, count: this.count };
  }
  code(): string {
    return `${INITIALS[this.fruit]}${this.count}`;
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
