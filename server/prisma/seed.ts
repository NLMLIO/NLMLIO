import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnvFiles } from '../src/config/env';
import { AppModule } from '../src/app.module';
import { UserService } from '../src/modules/user/user.service';
import { GameResultService } from '../src/modules/game/game-result.service';
import { PasswordService } from '../src/common/security/password.service';
import { PASSWORD_PATTERN } from '@nlmlio/shared';

async function seed() {
  loadEnvFiles();
  const password = process.env.DEMO_PASSWORD;
  if (!password || !PASSWORD_PATTERN.test(password))
    throw new Error('Set DEMO_PASSWORD (8–64 characters, letters and numbers)');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const users = app.get(UserService);
    const accounts = [];
    for (const [username, nickname] of [
      ['fruitking', '과일왕'],
      ['banana', '바나나킥'],
      ['strawberry', '딸기좋아'],
      ['lime', '라임라임'],
    ]) {
      const existing = await users.findForLogin(username);
      const user =
        existing ??
        (await users.createAccount({
          username,
          nickname,
          email: `${username}@example.com`,
          passwordHash: await app.get(PasswordService).hash(password),
        }));
      accounts.push(user);
    }
    const names = ['점심 내기 한판', '새벽 할리갈리', '스피드 고수만', '초보 환영', '종 치기 연습'];
    for (let index = 0; index < 48; index++) {
      const end = new Date(Date.UTC(2026, 9, 20, 5, 12) - index * 3 * 3600000);
      const myRank = index < 20 ? 1 : (index % 3) + 2;
      const ranks = [myRank, ...[1, 2, 3, 4].filter((rank) => rank !== myRank)];
      await app.get(GameResultService).settle({
        gameId: `demo-profile-${index}`,
        roomCode: '482913',
        roomName: names[index % names.length],
        startedAt: new Date(end.getTime() - 600000).toISOString(),
        endedAt: end.toISOString(),
        players: accounts.map((account, playerIndex) => ({
          userId: account.id,
          rank: ranks[playerIndex],
          departed: false,
          bellSuccess: playerIndex === 0 ? (index % 5) + 1 : 3,
          bellFail: playerIndex === 0 ? (index % 4 === 0 ? 1 : 0) : 1,
          reactionSumMs:
            (playerIndex === 0 ? (index % 5) + 1 : 3) * (playerIndex === 0 ? 420 : 530),
        })),
      });
    }
    console.log('개발용 4계정과 48경기 생성 완료. 이미 생성된 경기는 다시 지급하지 않습니다.');
  } finally {
    await app.close();
  }
}
void seed();
