import { Injectable } from '@nestjs/common';

/** RoomModule은 게임 모듈을 import하지 않고 공개된 수명주기로만 게임에 연결한다. */
@Injectable()
export class RoomGameLifecycle {
  private hooks?: {
    start: (userId: number) => Promise<void>;
    leaving: (userId: number, remove: () => Promise<void>) => Promise<void>;
    closed: (code: string) => void;
  };
  register(hooks: NonNullable<RoomGameLifecycle['hooks']>): void {
    this.hooks = hooks;
  }
  async start(userId: number): Promise<void> {
    if (!this.hooks) throw new Error('Game engine is not initialized');
    await this.hooks.start(userId);
  }
  async leaving(userId: number, remove: () => Promise<void> = async () => {}): Promise<void> {
    if (this.hooks) await this.hooks.leaving(userId, remove);
    else await remove();
  }
  closed(code: string): void {
    this.hooks?.closed(code);
  }
}
