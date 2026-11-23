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
    private name: string,
    hand: readonly Card[],
  ) {
    this.hand = [...hand];
  }
  get nickname(): string {
    return this.name;
  }
  rename(nickname: string): void {
    this.name = nickname;
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
  penalty(count = 1): Card[] {
    return this.hand.splice(0, count);
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
  cards(): Card[] {
    return [...this.hand];
  }
  /** 도르마무: 판정 전의 카드와 종 기록으로 되돌린다 */
  restore(hand: readonly Card[], stats: ReturnType<GamePlayer['statistics']>): void {
    this.hand = [...hand];
    this.success = stats.bellSuccess;
    this.fail = stats.bellFail;
    this.reaction = stats.reactionSumMs;
  }
  /** 안해: 새로 분배받은 카드로 처음부터 다시 시작한다(종 기록도 지운다) */
  restart(hand: readonly Card[]): void {
    this.hand = [...hand];
    this.success = 0;
    this.fail = 0;
    this.reaction = 0;
    this.automatic = 0;
  }
  handCodes(): string[] {
    return this.hand.map((card) => card.code());
  }
}
