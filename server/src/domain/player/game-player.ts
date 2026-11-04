import { GamePlayerStatus } from '@nlmlio/shared';
import { Card } from '../card/deck';

export class GamePlayer {
  private hand: Card[];
  private state: GamePlayerStatus = GamePlayerStatus.ACTIVE;
  private online = true;
  private automatic = 0;
  private success = 0;
  private fail = 0;
  private reaction = 0;
  constructor(
    readonly userId: number,
    readonly nickname: string,
    hand: readonly Card[],
  ) {
    this.hand = [...hand];
  }
  get status(): GamePlayerStatus {
    return this.state;
  }
  get active(): boolean {
    return this.state === GamePlayerStatus.ACTIVE;
  }
  get handCount(): number {
    return this.hand.length;
  }
  get connected(): boolean {
    return this.online;
  }
  get automaticTurns(): number {
    return this.automatic;
  }
  draw(automatic = false): Card {
    const card = this.hand.shift();
    if (!card) throw new Error('Empty hand');
    this.automatic = automatic ? this.automatic + 1 : 0;
    return card;
  }
  take(cards: readonly Card[]): void {
    this.hand.push(...cards);
  }
  penalty(): Card[] {
    const card = this.hand.shift();
    return card ? [card] : [];
  }
  eliminate(departed: boolean): Card[] {
    this.state = departed ? GamePlayerStatus.DEPARTED : GamePlayerStatus.ELIMINATED;
    const cards = this.hand;
    this.hand = [];
    return cards;
  }
  connection(connected: boolean): void {
    this.online = connected;
  }
  bell(success: boolean, reactionMs: number): void {
    if (success) {
      this.success++;
      this.reaction += Math.max(0, Math.round(reactionMs));
    } else this.fail++;
  }
  statistics() {
    return { bellSuccess: this.success, bellFail: this.fail, reactionSumMs: this.reaction };
  }
  handCodes(): string[] {
    return this.hand.map((card) => card.code());
  }
}
