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
    return cards;
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
