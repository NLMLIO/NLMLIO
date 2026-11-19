/** 같은 브라우저의 카드 요청이 진행 중이면 종 의도는 그 응답 뒤 최신 스냅샷으로 보낸다. */
export class GameInputSequence {
  private card: Promise<string | null> | null = null;

  get playing(): boolean {
    return this.card !== null;
  }

  play(send: () => Promise<string | null>): Promise<string | null> {
    if (this.card) return this.card;
    const request = send().finally(() => {
      if (this.card === request) this.card = null;
    });
    this.card = request;
    return request;
  }

  async beforeBell(): Promise<void> {
    await this.card;
  }
}
