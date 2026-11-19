import { Injectable } from '@nestjs/common';

/** 먼저 접수된 방 이벤트가 인증·Redis·DB await 중에도 추월당하지 않게 한다. */
@Injectable()
export class RoomQueue {
  private readonly tails = new Map<string, Promise<void>>();
  run<T>(code: string, task: () => Promise<T> | T): Promise<T> {
    const result = (this.tails.get(code) ?? Promise.resolve()).then(task);
    const tail = result.then(
      () => {},
      () => {},
    );
    this.tails.set(code, tail);
    void tail.then(() => {
      if (this.tails.get(code) === tail) this.tails.delete(code);
    });
    return result;
  }
}
