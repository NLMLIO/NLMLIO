import { Fruit } from '@nlmlio/shared';
import { Card } from '../card/deck';

export class Table {
  private readonly stacks = new Map<number, Card[]>();
  constructor(userIds: number[]) {
    for (const id of userIds) this.stacks.set(id, []);
  }
  play(userId: number, card: Card): void {
    this.stacks.get(userId)!.unshift(card);
  }
  cards(userId: number): readonly Card[] {
    return this.stacks.get(userId) ?? [];
  }
  remove(userId: number): Card[] {
    const cards = this.stacks.get(userId) ?? [];
    this.stacks.set(userId, []);
    // 판정으로 옮겨지는 카드의 금칠은 사라지고, 과일 6개 카드는 어디로도 가지 않고 사라진다.
    for (const card of cards) {
      card.ungild();
      card.unboost();
    }
    return cards.filter((card) => !card.special);
  }
  /** 판정이 났다. 테이블에 남은 과일 6개 카드는 성공·오발과 상관없이 사라진다 */
  discardSpecial(): void {
    for (const [id, cards] of this.stacks)
      this.stacks.set(
        id,
        cards.filter((card) => !card.special),
      );
  }
  collect(): Card[] {
    return [...this.stacks.keys()].flatMap((id) => this.remove(id));
  }
  totals(): Record<Fruit, number> {
    const totals: Record<Fruit, number> = { STRAWBERRY: 0, BANANA: 0, LIME: 0, PLUM: 0 };
    for (const cards of this.stacks.values())
      if (cards[0]) totals[cards[0].fruit] += cards[0].count;
    return totals;
  }
}
