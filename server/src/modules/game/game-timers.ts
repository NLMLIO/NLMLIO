import { Injectable, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class GameTimers implements OnModuleDestroy {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private destroyed = false;
  schedule(key: string, deadline: number, callback: () => void): void {
    if (this.destroyed) return;
    this.cancel(key);
    const timer = setTimeout(
      () => {
        this.timers.delete(key);
        callback();
      },
      Math.max(0, deadline - Date.now()),
    );
    timer.unref?.();
    this.timers.set(key, timer);
  }
  cancel(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }
  onModuleDestroy(): void {
    this.destroyed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
