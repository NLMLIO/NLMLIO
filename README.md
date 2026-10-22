# NLMLIO

React + TypeScript 클라이언트, NestJS 서버, 공유 HTTP 타입으로 구성된 pnpm 모노레포입니다.

## 이번 구현

- `FUNC-001-01~05`: 회원가입, 닉네임 중복 확인, 입력 검증, 로그인, Refresh 회전과 로그아웃.
- `FUNC-002-01`, `FUNC-008-01~02`: 프로필, 닉네임·이메일·비밀번호 수정, 누적 전적·포인트·내 순위 대시보드. 이번 요청 범위에서는 티어를 제외했습니다.
- `FUNC-007-01~02`: 승수 내림차순·패수 오름차순의 글로벌 랭킹과 개인 전적, 승패·승률·종 성공률·평균 반응 시간.
- `FUNC-005-11`, `FUNC-006-01`: 확정된 게임 결과와 순위별 포인트를 한 PostgreSQL 트랜잭션으로 저장하는 서버 내부 서비스.

첨부 디자인의 검정 배경, 라임색 포인트, 대시보드와 오른쪽 수정 패널, 전적 테이블을 재현했습니다. 화면의 수치는 샘플 상수가 아니라 서버가 조회한 DB 값입니다. 게임 엔진·실시간 방·채팅은 아직 구현하지 않았으며, 로비 메뉴는 비활성 상태입니다.

## 실행

```bash
pnpm install
cp .env.example .env
```

`.env`의 `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`에 서로 다른 32자 이상의 무작위 값을 설정합니다. 다음 명령으로 값을 생성할 수 있습니다.

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

```bash
pnpm db:up
pnpm db:deploy
pnpm dev
```

이 작업에서 만든 로컬 체크아웃은 `.superset/workspace.env`에 클라이언트 3210, 서버 3211, PostgreSQL 3212, Redis 3213을 설정했습니다. 브라우저에서 `http://localhost:3210`을 열면 됩니다. 다른 체크아웃은 기존 Superset setup의 포트 할당을 사용합니다.

## 샘플 데이터

빈 계정으로 직접 가입하거나, 개발용 4계정과 48경기를 생성할 수 있습니다.

```bash
DEMO_PASSWORD='<직접 정한 영문·숫자 포함 비밀번호>' pnpm db:seed
```

아이디는 `fruitking`, `banana`, `strawberry`, `lime`입니다. seed는 기존 사용자의 비밀번호를 덮어쓰지 않습니다. 이미 저장한 경기 ID는 건너뛰므로 다시 실행해도 포인트가 중복 지급되지 않습니다. 운영 DB에 실행하지 마세요.

## 주요 API

모든 경로는 `/api` 접두어를 사용합니다. 인증된 조회·수정에는 `Authorization: Bearer <Access JWT>`가 필요합니다.

| 메서드 | 경로 | 역할 |
|---|---|---|
| GET | `/auth/nickname?nickname=...` | 닉네임 사용 가능 여부와 10분 유효 확인 토큰 |
| POST | `/auth/register` | 회원가입. 확인 토큰이 닉네임과 일치해야 함 |
| POST | `/auth/login` | Access 발급, Refresh HttpOnly 쿠키 설정 |
| POST | `/auth/refresh` | 쿠키의 Refresh와 Redis 지문 비교 후 원자적으로 회전 |
| POST | `/auth/logout` | 일치하는 Refresh 폐기, 쿠키 제거 |
| GET | `/users/me` | 로그인한 사용자 프로필 |
| GET | `/users/me/dashboard` | 프로필·순위·전체 누적 통계 |
| PATCH | `/users/me` | 개인정보 수정 |
| GET | `/users/me/history?page=1&pageSize=10` | 개인 경기 기록과 전체 누적 통계 |
| GET | `/ranking?page=1&pageSize=10` | 글로벌 순위와 내 순위 |

페이지 크기는 최대 50입니다. 프로필 수정에는 바뀐 필드만 전달합니다.

```json
{
  "nickname": "새닉네임",
  "nicknameCheckToken": "중복확인 응답의 checkToken",
  "email": "new@example.com",
  "currentPassword": "현재 비밀번호",
  "newPassword": "새 비밀번호"
}
```

비밀번호 필드는 변경할 때만 필요합니다. 비밀번호 변경 후 서버는 기존 Access·Refresh를 무효화하며, 프론트는 재로그인 화면으로 이동합니다. 닉네임 확인 이후 입력값을 바꾸면 확인을 다시 해야 하고, 확인 후 다른 사람이 선점했더라도 DB 유니크 제약으로 최종 중복을 막습니다.

## 구조와 데이터 기준

`client/pages → api/http → Controller → Service → Repository → Prisma` 방향으로 연결합니다. HTTP DTO·유효성 규칙은 `shared`에서 공유합니다. 순수 `PlayerStatistics`와 `GameSettlement`는 NestJS·Prisma·Redis를 import하지 않습니다.

- 전적 원본: PostgreSQL `Game`, `GameResult`. 게임 종료 시점의 방 이름과 참가 인원도 함께 보존합니다.
- 승률: 1등이면서 이탈하지 않은 게임 수 / 전체 게임 수. 나머지는 패로 셉니다.
- 종 성공률: 종 성공 횟수 / (성공 + 오발 횟수).
- 평균 반응 시간: 성공한 종의 반응 시간 합 / 성공 횟수. 성공 기록이 없으면 `null`이며 화면에 `—`를 표시합니다.
- 순위: 승수가 많은 순서, 같은 승수에서는 패수가 적은 순서입니다. 승패까지 같으면 가입일, ID 오름차순으로 정렬합니다. 중도 이탈은 1패, 기록이 없으면 0승 0패입니다. 랭킹과 마이페이지에 같은 기준을 적용합니다.
- 비밀번호: Argon2id(19 MiB, 2회, 병렬 1)로 해시합니다.
- Refresh: 로그인할 때마다 기기 세션 ID(`sid`)를 만들고 `refresh:{userId}:{sid}`에 SHA-256 지문과 토큰 만료에 맞춘 TTL을 저장합니다. 재발급·로그아웃은 그 기기 세션만 바꾸고, 비밀번호를 바꾸면 모든 기기 세션을 지웁니다. 원문 토큰은 HttpOnly·SameSite 쿠키로만 브라우저에 전달합니다.
- 통계는 PostgreSQL 원본에서 전체를 집계합니다. Redis 전적 50개 캐시나 단순 점수 ZSET을 통계의 원본으로 사용하지 않습니다.

게임 엔진의 종료 처리에서는 `GameModule`이 내보내는 `GameResultService.settle(input)`을 호출하면 됩니다. `SettleGameInput`은 `shared/src/dto.ts`에 있습니다. 같은 `gameId`의 중복 호출은 `{ saved: false }`, 첫 저장은 `{ saved: true }`를 반환합니다. 브라우저가 순위·포인트를 위조할 수 없도록 결과 제출용 HTTP API는 제공하지 않습니다.

## 검사

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

전용 테스트 DB를 만든 뒤 다음 순서로 실행합니다. `DATABASE_URL`을 이미 설정했다면 반드시 해당 테스트 DB URL로 별도 지정하세요.

```bash
POSTGRES_DB=nlmlio_profile_test pnpm --filter @nlmlio/server exec prisma migrate reset --force
POSTGRES_DB=nlmlio_profile_test pnpm test:e2e
```

테스트에서는 비밀번호 오입력, 닉네임 확인 토큰 바꿔치기, DB 중복 값, 인증 없는 조회, Refresh 재사용 거부, 점수 중복 지급 방지, 실제 트랜잭션 롤백, 승패 기준 정렬·동률·페이지 조회·이탈 반영을 확인합니다. 사용자·경기 테스트 데이터만 정리하며 Redis 전체를 비우지 않습니다.
