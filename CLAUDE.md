# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

이 저장소에서 작업하는 Claude Code(및 다른 코딩 에이전트)를 위한 안내서다. 작업을 시작하기 전에 끝까지 읽고 아래 규칙을 따른다.

> **현재 상태**: 인증(회원가입·로그인·토큰 회전·로그아웃), 개인정보 수정, 개인 대시보드, 전적·랭킹 조회를 구현했다. Prisma의 `User`, `Game`, `GameResult`와 서버 내부 정산 서비스가 있다. 게임 엔진·방·채팅은 아직 계획 단계다. 2026-10-21 요청에 따라 이번 마이페이지 화면에는 티어를 표시하지 않는다.

## 명령어

루트에서 실행한다. pnpm이 `package.json`의 `devEngines`에 따라 **Node 24**를 내려받아 쓰므로 시스템 Node 버전과 상관없다.

| 명령 | 하는 일 |
|---|---|
| `pnpm install` | 의존성 설치 + `shared` 빌드 + `prisma generate` |
| `pnpm db:up` / `pnpm db:down` | PostgreSQL·Redis 컨테이너 시작(헬스체크까지 대기) / 정지 |
| `pnpm dev` | shared(tsc watch) + server(nest watch) + client(vite) 동시 실행 |
| `pnpm build` | shared → server, client 빌드 |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | 타입 검사 / oxlint / prettier |
| `pnpm test` | 서버 단위 테스트(Jest). 클라이언트 테스트 러너는 아직 없다 |
| `pnpm test:e2e` | 서버 e2e 테스트. 실제 DB·Redis가 필요하다(`pnpm db:up` 먼저) |
| `pnpm db:migrate --name <설명>` | `schema.prisma` 변경으로 마이그레이션 생성·적용(`prisma migrate dev`) |
| `pnpm db:deploy` | 마이그레이션 적용만(`prisma migrate deploy`) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:seed` | `DEMO_PASSWORD`로 개발용 계정 4개와 48경기 생성. 기존 경기 중복 지급 없음 |

- 테스트 하나만: `pnpm --filter @nlmlio/server test src/경로/파일.spec.ts` 또는 `pnpm --filter @nlmlio/server test -t "테스트 이름"` (e2e는 `test:e2e`). `--`를 붙이면 Jest가 인자를 못 받는다
- 패키지 하나에만 명령: `pnpm --filter @nlmlio/<shared|server|client> <script>`
- 새 의존성: `pnpm --filter @nlmlio/<패키지> add <이름>` (2절 규칙대로 먼저 묻는다)

---

## 1. 프로젝트 개요

**낼래말래io** — 할리갈리 규칙의 실시간 온라인 대전 웹 게임. 「(2026) 객체지향프로그래밍」 수업 프로젝트이고, 저장소·노션의 프로젝트명은 NLMLIO다.
회원이 로그인해 방을 만들거나 참가하고, 대기실·게임 중 채팅을 하며, 여러 명이 동시에 할리갈리(테이블 위 같은 과일 합이 **정확히 5개**일 때 종을 먼저 친 사람이 카드를 가져가는 게임)를 플레이한다. 게임 결과로 포인트가 쌓이고, 포인트 기준 글로벌 랭킹과 개인 전적을 볼 수 있다.

- **기능 명세는 [`FUNCTION.md`](FUNCTION.md)에 있다.** 각 기능은 `FUNC-XXX-YY` ID를 가진다. 원본은 노션 「Project ▸ NLMLIO ▸ 자료실 ▸ 기능 명세서」이고, 명세를 바꾸면 `FUNCTION.md`와 노션을 함께 고친다.
- 이 수업은 **객체지향 설계**를 평가한다. 동작하는 코드만큼 **책임 분리·캡슐화·도메인 모델**이 중요하다.
- 할리갈리는 **반응 속도가 생명**인 게임이다. 종 치기의 입력 → 소리 → 판정 → 반영까지의 지연을 항상 의식한다.

---

## 2. 기술 스택

### Frontend

| 기술 | 역할 |
|---|---|
| **React + TypeScript** | 로비·대기실·게임·랭킹·마이페이지 화면, 카드·유저 상태의 타입 안정성 |
| **Socket.io-client** | 카드 내기·종 치기·채팅·입장/퇴장 등 실시간 통신 |
| **Zustand** | 실시간 게임 상태(내 덱 수량, 현재 턴, 테이블 카드) 관리 |
| **Howler.js** | 효과음(FUNC-005-14) — 종소리는 누르는 즉시 지연 없이 재생 |

- Next.js, PixiJS 같은 무거운 프레임워크·2D 엔진은 **쓰지 않는다.** 화면은 React 컴포넌트와 CSS로 충분하다.
- 위 4개 외의 라이브러리는 추가하기 전에 먼저 묻는다(라우터·HTTP 클라이언트 등 필요해지면 제안만 한다).

### Backend

| 기술 | 역할 |
|---|---|
| **NestJS (TypeScript)** | 서버 프레임워크. 기능별 Module · HTTP Controller · Socket.io Gateway · DI |
| **Socket.io** (`@nestjs/websockets` + `@nestjs/platform-socket.io`) | 방·채팅·게임 실시간 이벤트 |
| **PostgreSQL** | 영속 데이터 — 회원, 게임 결과(Game/GameResult), 포인트, 랭킹·전적 |
| **Prisma** (ORM) | PostgreSQL 스키마·마이그레이션·타입 생성 클라이언트. `PrismaService`로 Nest에 주입 |
| **Redis** | 휘발성·공유 데이터 — Refresh 토큰, 사용 중인 방 코드, 접속·재접속 세션, 채팅 도배 제한 카운터 |
| **JWT (Access + Refresh)** | 인증. HTTP는 Guard, Socket.io는 handshake에서 검증 |

#### 데이터를 어디에 두는가

| 데이터 | 저장 위치 | 이유 |
|---|---|---|
| 회원·게임 결과·포인트 | **PostgreSQL** | 잃으면 안 되는 데이터. 결과 저장 + 포인트 지급은 한 트랜잭션(005-11, 006-01) |
| Refresh 토큰 | **Redis** (TTL = 만료 시간) | 만료 자동 삭제, 로그아웃·재발급 시 즉시 무효화 |
| 사용 중인 6자리 방 코드 | **Redis** (`SET NX`) | 코드 중복 없이 원자적으로 예약(003-02) |
| 접속·재접속 대기 정보 | **Redis** (TTL = 재접속 대기 시간) | 끊긴 플레이어를 원래 방으로 복귀(003-07) |
| 채팅·이모티콘 연속 전송 횟수 | **Redis** (`INCR` + TTL, 토큰과 무관한 사용자별 키) | 도배 방지(004-01, 004-02) |
| 진행 중인 게임 상태(덱·테이블·차례) | **서버 메모리** (방별 객체) | 종 판정은 밀리초 단위 — 매 이벤트마다 Redis를 왕복하지 않는다. 재접속용 스냅샷만 필요 시 Redis에 |

#### 왜 Prisma인가

- **도메인 순수성**: TypeORM·MikroORM은 데코레이터 엔티티 클래스가 도메인 클래스와 섞이기 쉽다. Prisma는 `schema.prisma`에서 **타입만 생성**하므로 `Game`·`Player` 같은 도메인 클래스를 DB와 분리해 둘 수 있다(6.4).
- **트랜잭션**: 결과 저장 + 포인트 지급(005-11, 006-01)을 `prisma.$transaction(async (tx) => …)` 하나로 묶는다. 중복 저장은 스키마의 `@@unique`로 막는다.
- **협업**: 스키마가 한 파일이라 리뷰가 쉽고, `prisma migrate`로 마이그레이션 이력이 남는다.
- 필요한 쿼리가 CRUD + 랭킹 정렬·페이지 조회 수준이라 SQL 빌더(Drizzle)까지는 필요 없다.

- **패키지 매니저·워크스페이스: pnpm workspaces.** 루트 `package.json`의 `packageManager` 필드로 pnpm 버전을, `devEngines.runtime`으로 Node 24를 고정한다. npm·yarn·bun으로 설치하지 않는다.
  - pnpm은 의존성 설치 스크립트를 기본으로 막는다. 허용 목록은 `pnpm-workspace.yaml`의 `allowBuilds`다.
  - 갓 배포된 버전은 pnpm의 최소 공개 기간 정책에 걸린다. 예외(`minimumReleaseAgeExclude`)를 추가하지 말고 버전 범위를 넓혀 이전 버전을 쓴다.
- **Redis 클라이언트: ioredis.**
- **도구**: 클라이언트 빌드·개발 서버는 Vite, 린트는 oxlint, 포맷은 prettier(`.prettierrc`).

#### 버전별 주의점

- **NestJS 12는 ESM 패키지**다. 서버 코드 자체는 CommonJS(`module: nodenext`, `"type"` 없음)로 컴파일하고 Node의 `require(esm)`으로 Nest를 불러온다. Jest는 `--experimental-vm-modules`와 Node 24.9 이상이 있어야 Nest를 불러올 수 있다(그래서 Node 24).
- **TypeScript는 6.x**다. Nest CLI와 ts-jest가 7을 아직 지원하지 않는다.
- **Prisma 7**: 접속 URL은 `schema.prisma`가 아니라 `server/prisma.config.ts`에 있다. 클라이언트는 `prisma-client` 생성기가 `server/src/generated/prisma`에 만들고(gitignore), `@prisma/adapter-pg` 드라이버 어댑터로 연결한다. 생성 코드는 `./x.js` 확장자로 import하므로 Jest 설정에 `.js → .ts` 매핑이 있다.

#### 환경변수 읽는 순서

셸 환경 > `.superset/workspace.env`(워크스페이스 포트) > `.env`. 서버는 `server/src/config/env.ts`의 `loadEnvFiles()`, 클라이언트는 `vite.config.ts`, Prisma CLI는 `prisma.config.ts`가 같은 순서로 읽는다.
- 포트: `CLIENT_PORT`(기본 5173), `SERVER_PORT`(3000), `POSTGRES_PORT`(5432), `REDIS_PORT`(6379)
- `DATABASE_URL`·`REDIS_URL`은 비워 두면 위 포트와 `POSTGRES_*` 값으로 만든다(`databaseUrl()`, `redisUrl()`). 코드에서 URL을 직접 조립하지 말고 이 함수를 쓴다.
- 클라이언트는 Vite 프록시로 `/api`, `/socket.io`를 서버에 넘긴다. 같은 출처로 붙으므로 CORS 설정이 필요 없다.

> NestJS 기본 테스트 러너는 Jest다. 다른 테스트 러너는 `package.json`을 먼저 확인하고, 없으면 **임의로 고르지 말고 질문**한다.
> 서버를 여러 대로 늘릴 계획이 생기면 게임 상태 위치와 Socket.io Redis adapter를 다시 설계해야 한다 — 지금은 **서버 1대** 전제다.

### 공유 타입

프론트와 백엔드는 둘 다 TypeScript이므로 **Socket 이벤트 이름·페이로드 타입, 도메인 enum(과일, 방 상태, 게임 상태)을 `shared/` 한 곳에 정의해 공유**한다. 같은 타입을 양쪽에 따로 손으로 쓰지 않는다.

---

## 3. 폴더 구조 (계획)

프론트·백엔드·공유 타입을 한 저장소에 두는 pnpm workspaces 모노레포다(`pnpm-workspace.yaml`에 `shared`, `server`, `client`).

```plain text
.
├── CLAUDE.md
├── FUNCTION.md               # 기능 명세 (FUNC-ID)
├── README.md
├── package.json              # 워크스페이스 루트 (공통 스크립트, packageManager: pnpm, devEngines: Node 24)
├── pnpm-workspace.yaml       # 패키지 목록, allowBuilds
├── compose.yaml              # 개발용 PostgreSQL 18 · Redis 8
├── .env.example              # 환경변수 이름만 (값 금지)
│
├── shared/                   # 프론트·백엔드가 함께 쓰는 타입 — 여기만 고치면 양쪽이 같이 바뀐다
│   └── src/
│       ├── events.ts         # Socket 이벤트 이름 상수 + 페이로드 타입 (C→S / S→C)
│       ├── domain.ts         # Fruit, RoomStatus, GameStatus 등 enum/유니온
│       ├── dto.ts            # HTTP 요청·응답 타입 (회원, 랭킹, 전적)
│       └── index.ts
│
├── server/                   # NestJS + Socket.io + PostgreSQL + Redis
│   ├── src/
│   │   ├── main.ts           # 부트스트랩: 환경변수 로드, /api 접두어, ValidationPipe, Socket.io 어댑터
│   │   ├── app.module.ts     # 루트 모듈 — 아래 모듈을 조립
│   │   ├── domain/           # ⭐ 게임 규칙 — 순수 TS 클래스. Nest·Socket.io·DB·Redis를 import하지 않는다
│   │   │   ├── card/         #   Card, Deck(셔플·분배), Fruit
│   │   │   ├── game/         #   Game, Round, Table(과일 합), Bell(선착순·판정), Penalty, Ranking(최종 순위)
│   │   │   ├── player/       #   Player(보유 카드, 탈락)
│   │   │   └── room/         #   Room(방장 위임, 인원 제한)
│   │   ├── modules/          # NestJS 기능 모듈 — 모듈마다 controller / gateway / service / dto
│   │   │   ├── auth/         #   FUNC-001  회원가입·로그인·재발급 (controller), JWT Guard, WsJwtGuard
│   │   │   ├── user/         #   FUNC-002·008  유저 정보, 마이페이지
│   │   │   ├── room/         #   FUNC-003  방 생성·참가·나가기·재접속 (gateway + controller(공개 방 목록))
│   │   │   ├── chat/         #   FUNC-004  채팅·이모티콘 (gateway), 도배 제한
│   │   │   ├── game/         #   FUNC-005·006  게임 진행 (gateway), 방별 이벤트 큐, 결과 저장 + 포인트 트랜잭션
│   │   │   └── ranking/      #   FUNC-007  랭킹·전적 (controller, 페이지 조회)
│   │   ├── infra/
│   │   │   ├── database/     #   PrismaModule·PrismaService(연결·종료 훅), 모듈별 Repository 구현
│   │   │   ├── redis/        #   Redis 모듈·클라이언트 (토큰, 방 코드, 세션, rate limit)
│   │   │   └── game-state/   #   진행 중인 방·게임 인메모리 저장소
│   │   ├── health/           # GET /api/health — DB·Redis 연결 확인
│   │   ├── generated/prisma/ # prisma generate 결과 (gitignore, 직접 고치지 않는다)
│   │   ├── common/           # 공통: 예외 필터(HTTP·WS), 인터셉터, 데코레이터(@CurrentUser), 파이프
│   │   └── config/           # env.ts(환경변수 파일 로드, DB·Redis URL, 포트), @nestjs/config 검증
│   ├── prisma.config.ts      # Prisma 7 설정: 스키마·마이그레이션 경로, 접속 URL
│   ├── prisma/
│   │   ├── schema.prisma     # ⭐ DB 스키마의 유일한 원본 (User, Game, GameResult, PointHistory …)
│   │   ├── migrations/       # prisma migrate가 만든 SQL 이력 — 손으로 고치지 않는다
│   │   └── seed.ts           # 개발용 시드 데이터
│   └── test/
│       ├── domain/           # 규칙 단위 테스트 (Nest 없이 순수 클래스만)
│       └── e2e/              # 동시 종 치기, 재접속, 결과 저장 롤백 (테스트용 PostgreSQL·Redis)
│
└── client/                   # React + TypeScript
    ├── public/
    │   └── sounds/           # 효과음 파일 (FUNC-005-14) + 출처·라이선스 기록
    └── src/
        ├── main.tsx
        ├── App.tsx           # 화면 전환 (로그인 / 로비 / 대기실 / 게임 / 랭킹 / 마이페이지)
        ├── pages/            # 화면 단위 컴포넌트: auth / lobby / room / game / ranking / mypage
        ├── components/       # 여러 화면이 쓰는 UI 조각 (Card, PlayerSlot, ChatBox, Modal…)
        ├── stores/           # Zustand 스토어 — 서버 상태의 거울, 규칙 계산 금지
        ├── socket/           # Socket.io 클라이언트 생성, 이벤트 수신 → 스토어 갱신 연결
        ├── api/              # HTTP 호출 (토큰 첨부, 401 시 재발급 후 재시도)
        ├── audio/            # Howler 인스턴스, preload, 자동재생 잠금 해제, 음소거 설정
        ├── hooks/            # useBellShortcut(키보드 종), useReconnect 등
        └── styles/
```

### 의존 방향 (어기면 안 되는 규칙)

#### 현재 구현한 위치

- `shared/src/dto.ts`, `validation.ts`: HTTP 계약과 클라이언트·서버 입력값 규칙.
- `server/src/common/security/`: scrypt, JWT, HTTP Guard, Redis Refresh 세션. Refresh는 HttpOnly 쿠키에 저장하고 Redis에는 토큰의 SHA-256 지문을 저장한다.
- `server/src/domain/user/`: 인프라와 독립적인 계정 타입, 누적 통계 계산 객체.
- `server/src/domain/game/game-settlement.ts`: 확정 순위 검증과 명세의 포인트 지급식.
- `server/src/modules/auth`, `user`, `ranking`: 인증, 프로필·대시보드, 개인 전적·리더보드.
- `server/src/modules/game/game-result.service.ts`: 게임 엔진이 최종 결과를 전달할 서버 내부 진입점. 결과 제출용 HTTP 엔드포인트는 없다.
- `server/src/infra/database/*repository.ts`: Prisma 타입·쿼리와 트랜잭션을 캡슐화.
- `client/src/pages/auth`, `mypage`, `ranking`: 요청 이미지에 맞춘 화면. `api/http.ts`는 단일 Refresh 요청과 한 번의 HTTP 재시도를 담당한다.
- `client/src/components/`, `hooks/`, `styles/`: 통계·페이지네이션·오류 UI와 조회 훅, 공통 스타일.
- `server/tsconfig.seed.json`: Prisma 7 생성 코드의 `.js` import를 ts-node에서 원본 `.ts`로 해석하는 seed 전용 설정.

위 구현에서 전적·포인트의 영속 원본은 PostgreSQL이다. 개인 통계는 전체 `GameResult` 합계로 계산하며 페이지 크기에 영향을 받지 않는다. Redis의 `ranking`·`user:{id}:history`는 이번 구현에 필수 캐시로 추가하지 않는다. 동점 순위는 PostgreSQL의 점수 도달 시각·가입일·ID 순서로 일관되게 계산한다.

- `server/src/domain` → 아무것도 import하지 않는다(`shared` 타입 제외). `@Injectable` 등 Nest 데코레이터도 붙이지 않는다.
- Controller·Gateway는 **입력 검증·인증·이벤트 변환만** 하고 Service를 호출한다. 규칙은 Service → domain 클래스에 맡긴다.
- 모듈끼리는 서로의 Service를 `exports`로 공개한 것만 쓴다. 다른 모듈의 Repository·Redis 키를 직접 건드리지 않는다.
- **Prisma 타입(`@prisma/client`)은 Repository 밖으로 내보내지 않는다.** Repository가 DB 행 ↔ 도메인 객체를 변환하고, Service·domain은 도메인 타입만 다룬다.
- `client/src/stores`는 소켓 이벤트로만 갱신되고, 컴포넌트는 스토어를 읽고 «의도» 이벤트만 보낸다.
- 이벤트·DTO 타입은 `shared/`에만 정의한다. `client`나 `server`에 같은 타입을 다시 쓰지 않는다.
- 새 폴더를 만들거나 구조를 바꾸면 이 절을 함께 고친다.

---

## 4. 도메인 용어

| 용어 | 뜻 |
|---|---|
| 방(Room) | 게임 단위. 공개/비공개, **6자리 방 코드**, 방장, 최대 인원(플레이 인원) |
| 대기실 | 게임 시작 전 방 화면. 채팅·참가자 목록·방장 설정 |
| 플레이어 / 관전자 | 게임 중 카드를 내고 종을 치는 사람 / 탈락·이탈해 보기·채팅만 하는 사람 |
| 덱 / 보유 카드 | 플레이어마다 뒤집힌 채 쌓인 카드 더미. 0장이 되면 **탈락** |
| 테이블 카드 | 플레이어가 자기 앞에 낸 카드 중 **맨 위 카드**. 종 판정 기준 |
| 보관 스택 | 종 아래에 모아 두는 카드(분배 후 남은 카드, 탈락·이탈자의 카드). 다음에 정당하게 종을 친 승자가 가져간다 |
| 종 누르기 | 테이블 위 같은 과일 합이 **정확히 5개**일 때 누르는 행동 |
| 선착순 판정 | 여러 명이 거의 동시에 종을 쳤을 때 **서버 도착 시각 기준 1명**만 인정 |
| 오발 벌칙 | 합이 5가 아닐 때 종을 친 플레이어가 다른 플레이어 각자에게 카드를 1장씩 주는 벌칙 |
| 탈락 / 이탈 | 카드 0장으로 빠짐(순위·포인트 정상) / 나가기·연결 끊김 5초·턴 시간 초과 3회로 빠짐(맨 아래, 0점). 둘 다 관전자가 된다 |
| 턴 제한 시간 | 차례마다 10초. 넘기면 서버가 대신 카드를 낸다 |
| 라운드 | 카드를 차례로 내다가 종 판정이 나거나 탈락자가 생기면 끝나는 단위 |
| 포인트 | 게임 결과 순위·성적에 따라 지급. 랭킹 기준 |

---

## 5. 기능 범위

기능별 설명·예외 처리·UI/UX, 공통 규칙(인원, 보관 스택, 탈락·이탈), 포인트 지급식, 입력값 제한, 에러 코드, 제외된 기능 목록은 **[`FUNCTION.md`](FUNCTION.md)** 를 본다. 여기에 다시 적지 않는다.

- 우선순위 1(핵심)을 먼저 끝내고, 2(부가)와 5(마지막)는 1이 동작한 뒤에 한다.
- `FUNCTION.md`의 「제외된 기능」은 만들지 않는다. 필요해 보이면 먼저 묻는다.

---

## 6. 설계 원칙 (반드시 지킬 것)

### 6.1 서버가 진실이다 (Server-Authoritative)

- 카드 분배, 차례, 테이블 합, 종 판정, 벌칙, 탈락, 순위는 **전부 서버가 계산하고 확정**한다.
- 클라이언트는 «의도»(`card:play`, `bell:ring` 같은 이벤트)만 보낸다. 결과는 서버가 방 전체에 보낸 상태로만 그린다.
- 클라이언트가 보낸 값(남은 카드 수, 과일 합, 클라이언트 시각 등)을 판정에 쓰지 않는다.

### 6.2 종 치기 — 체감은 즉시, 판정은 서버

- **종소리(Howler.js)는 클라이언트에서 누르는 즉시 재생**한다. 서버 응답을 기다리지 않는다(체감 지연 0).
- 단, **승패·카드 이동과 그 효과음(성공·오발)은 낙관적으로 처리하지 않는다.** 서버의 판정 이벤트를 받은 뒤에만 화면을 바꾸고 소리를 낸다.
- 효과음은 앱 시작 시 미리 로드(preload)하고, 브라우저 자동재생 정책 때문에 첫 사용자 입력 시점에 오디오를 활성화한다. 로드에 실패해도 게임은 계속 진행된다.
- 음소거 상태는 클라이언트 설정이다(localStorage). 서버에 보내지 않는다.

### 6.3 동시성 — 방 단위 직렬화

- Node는 단일 스레드지만 `await`가 끼면 같은 방의 이벤트가 섞여 처리될 수 있다. **같은 방의 게임 상태 변경은 방별 이벤트 큐로 하나씩 처리**한다(판정 중간에 `await`로 다른 이벤트가 끼어들지 않게).
- 선착순은 **서버가 이벤트를 받은 순서/시각**으로 정한다. 판정이 끝난 테이블에 대한 후속 `bell:ring`은 무시한다(멱등).
- 차례 검증(005-13)과 같은 차례 중복 요청 처리도 같은 큐 안에서 한다.
- 턴 타이머(005-15)와 연결 끊김 5초 유예(003-07)도 서버 타이머다. 만료되면 직접 상태를 바꾸지 말고 **같은 방 큐에 이벤트로 넣어** 다른 이벤트와 순서대로 처리한다. 타이머는 차례가 바뀌거나 게임이 끝나면 반드시 취소한다.

### 6.4 객체지향 설계 (수업 평가 기준)

- 게임 규칙은 **도메인 클래스 안에** 둔다. 예: `Game`, `Round`, `Player`, `Deck`, `Card`, `Table`, `Bell`, `Room`. Socket 핸들러나 라우터에 `if`로 규칙을 흩뿌리지 않는다.
- 상태는 `private` 필드로 감추고, 의미 있는 메서드로만 바꾼다(`player.drawTo(table)`, `game.ringBell(playerId)` 등).
- 과일 종류·방 상태·게임 상태는 공유 타입의 enum/유니온으로 표현한다.
- 도메인 클래스는 Socket.io·DB·HTTP를 **몰라야 한다.** 그래야 판정 규칙을 네트워크 없이 단위 테스트할 수 있다.

### 6.5 서버 계층

```plain text
Gateway (Socket.io) / Controller (HTTP)   ← DTO 검증(ValidationPipe), Guard 인증, 이벤트 ↔ 서비스 호출
        ↓
Service (모듈별)                          ← 방 관리, 게임 진행, 결과 저장 조율, 브로드캐스트 지시
        ↓
도메인 클래스 (Game, Room, Player…)       ← 규칙. Nest·DB·Redis 의존 없음
        ↓
PostgreSQL (영속) · Redis (휘발·TTL) · 인메모리 게임 상태
```

- 진행 중인 방·게임 상태는 **서버 메모리**에서 관리하고, 끝난 결과만 PostgreSQL에 저장한다(005-11).
- 결과 저장과 포인트 지급은 **같은 PostgreSQL 트랜잭션**으로 묶는다(005-11, 006-01) — `prisma.$transaction(async (tx) => { … })` 안에서 모두 `tx`로 쓴다. 같은 게임의 중복 저장은 스키마의 유니크 제약으로 막고, 위반(`P2002`)은 «이미 저장됨»으로 처리한다.
- 스키마 변경은 `schema.prisma` 수정 → `pnpm db:migrate --name <설명>` 으로만 한다. DB에 직접 `ALTER`하지 않는다. 운영/배포 반영은 `prisma migrate deploy`.
- 랭킹 조회(007-01)는 정렬 컬럼에 인덱스(`@@index`)를 두고 `skip`/`take`(또는 커서)로 페이지 조회한다.
- Redis 키는 용도별 접두어로 구분하고 반드시 TTL을 단다. 예: `refresh:{userId}`, `room-code:{code}`, `session:{userId}`, `chat-limit:{userId}`(TTL 3초), `emoji-limit:{userId}`(TTL 2초).
- 도배 제한 카운터는 토큰·세션 키 안에 넣지 않는다. 토큰을 재발급해도 카운터가 초기화되지 않아야 하고, 탭이 여러 개여도 사용자 하나로 센다.
- 에러는 `FUNCTION.md` 「에러 코드」의 앱 에러 코드(`shared/`에 정의)로 보낸다. HTTP는 상태 코드와 앱 에러 코드를 함께, 소켓은 앱 에러 코드만 보낸다.
- 소켓 이벤트의 DTO도 HTTP와 같이 `class-validator`로 검증한다(Gateway에 `ValidationPipe` 적용).

### 6.6 프론트 상태 (Zustand)

- 게임 스토어는 **서버가 보낸 상태의 거울**이다. 스토어에서 규칙을 계산하지 않는다.
- 소켓 이벤트 수신 → 스토어 갱신 → 화면 렌더의 한 방향으로만 흐르게 한다.
- 실시간으로 자주 바뀌는 값(테이블 카드, 턴, 덱 수량)은 컴포넌트가 **필요한 조각만 selector로 구독**해 불필요한 리렌더를 막는다.
- 재접속(003-07) 시 서버가 보내는 «전체 상태 스냅샷»으로 스토어를 통째로 교체할 수 있게 설계한다.

### 6.7 보안·인증

- 비밀번호는 해시로 저장한다. 로그인 실패 메시지는 아이디/비밀번호 중 무엇이 틀렸는지 알려주지 않는다.
- Socket.io 연결 시 handshake의 토큰을 검증하고(Gateway `handleConnection` 또는 WS Guard), 인증되지 않은 소켓은 연결을 끊는다.
- Refresh 토큰은 Redis에 저장해 재발급 시 교체(rotation)하고, 이전 토큰은 즉시 무효화한다.
- 소켓 이벤트 페이로드도 HTTP 요청처럼 **서버에서 검증**한다(타입·길이·소속 방 확인).
- 시크릿(JWT 키, PostgreSQL·Redis 접속 정보)은 커밋하지 않는다. 환경변수로 읽고 `.env.example`에는 이름만 둔다.

---

## 7. 작업 방식

- 기능을 구현하거나 고칠 때 **`FUNCTION.md`에서 해당 `FUNC-ID`를 먼저 확인**하고, «예외 처리»를 빠짐없이 반영한다.
- 커밋 메시지와 PR 제목에 `FUNC-ID`를 붙인다. 예: `feat(FUNC-005-07): 서버 도착 순서 기준 선착순 판정`
- 명세에 없는 동작을 정해야 하면 **임의로 정하지 말고 질문**한다. 정해진 규칙(남는 카드, 오발 벌칙, 재접속, 턴 제한, 관전, 포인트, 동점 정렬, 도배 제한, 입력값 제한, 에러 코드)은 모두 `FUNCTION.md`에 있다.
- 명세와 코드가 어긋나면 어느 쪽을 고칠지 먼저 알린다. 명세 변경은 `FUNCTION.md`와 노션 기능 명세서에 함께 반영한다.
- Socket 이벤트를 추가·변경하면 공유 타입과 아래 «이벤트 목록»을 함께 갱신한다.

### Socket 이벤트 목록 (구현하면서 채운다)

| 방향 | 이벤트 | 페이로드 | FUNC |
|---|---|---|---|
| C→S | | | |
| S→C | | | |

### 테스트

- 도메인 규칙(분배, 합 계산, 종 판정, 벌칙, 탈락, 순위)은 단위 테스트를 반드시 작성한다.
- 동시성: «여러 플레이어가 같은 순간 `bell:ring`» 시나리오를 테스트로 재현한다.
- 결과 저장: «중간 실패 시 롤백», «같은 게임 두 번 저장 시도» 테스트를 둔다(테스트용 PostgreSQL 사용, 목(mock)으로 대체하지 않는다). 테스트 DB는 `prisma migrate reset`으로 매번 초기화한다.
- Redis: 방 코드 중복 예약, Refresh 토큰 재사용 거부, 도배 제한 TTL 만료를 확인한다.
- 재접속: 대기실 60초 안 복귀, 게임 중 5초 안 복귀(계속 플레이), 5초 뒤 복귀(관전자로 같은 상태 수신)를 확인한다.
- 타이머: 10초 초과 시 서버가 대신 내는지, 3회 연속이면 이탈 처리되는지, 차례가 바뀌면 타이머가 취소되는지 확인한다(가짜 타이머 사용).
- 포인트: `FUNCTION.md` 지급표의 값(2~6명, 이탈자 있는 경우 포함)을 그대로 테스트 케이스로 쓴다.

### 하지 말 것

- 클라이언트 값을 신뢰한 판정, 결과의 낙관적 렌더링
- 핸들러·라우터·Zustand 스토어에 게임 규칙 작성
- 확인 없이 새 의존성 추가, DB 스키마 변경, 기존 이벤트/API 형식 변경
- `prisma/migrations/` 안의 기존 마이그레이션 파일 수정, `prisma db push`로 운영 DB 변경
- 시크릿·토큰을 코드나 로그에 남기기
- 저작권이 불분명한 효과음·이미지 리소스 사용

---

## 8. Superset 워크스페이스

이 저장소는 Superset 워크스페이스(워크스페이스마다 `~/.superset/worktrees/` 아래 별도 git worktree)에서 개발한다. `.superset/config.json`이 세 스크립트를 수명주기에 연결하고, 셋 다 `.superset/lib.sh`를 불러 쓴다.

- `config.json`의 setup은 `setup.sh` 다음에 `pnpm db:deploy`(마이그레이션 적용)를 실행한다.
- `setup.sh` — 워크스페이스 생성 시 실행. 반복 실행해도 안전해야 한다. 순서대로:
  1. `$SUPERSET_ROOT_PATH`(메인 체크아웃)에서 추적되지 않는 `.env`, `.env.*`, `.envrc`를 복사한다. 이미 있는 파일은 덮어쓰지 않는다.
  2. `.env`가 없으면 `.env.example`을 복사한다.
  3. 포트를 예약한다.
  4. 의존성을 설치하고(`pnpm install`) `docker compose up -d --wait`으로 PostgreSQL·Redis를 띄운다. 설치 도구는 있는 lockfile·manifest로 고른다.
- `run.sh` — Run 버튼. 루트 `pnpm dev`를 실행한다.
- `teardown.sh` — 워크스페이스 삭제 시 실행. compose 프로젝트를 **볼륨까지** 내리고(워크스페이스 DB 삭제) 포트 예약을 푼다. setup이 새로 띄우는 것이 생기면 여기서 꼭 내린다.

### 워크스페이스별 포트

병렬 워크스페이스끼리 포트가 겹치면 안 된다.

- `lib.sh`가 워크스페이스마다 포트 10개 블록(3100–3109, 3110–3119, …)을 머신 전체 공용 파일 `~/.superset/port-allocations.tsv`에 예약한다. 여러 프로젝트가 같이 쓰며 `mkdir` 잠금으로 보호한다.
- 값은 gitignore된 `.superset/workspace.env`에 기록된다(setup·run 때마다 다시 쓴다): 블록 시작 `SUPERSET_PORT_BASE`, `CLIENT_PORT`(+0, `PORT`와 같음), `SERVER_PORT`(+1), `POSTGRES_PORT`(+2), `REDIS_PORT`(+3), `COMPOSE_PROJECT_NAME`.
- 새 서비스는 남은 +4~+9에서 포트를 받는다. `lib.sh`의 `write_workspace_env`에 변수를 추가하고, 코드에는 기본값과 함께 그 변수를 읽게 한다. 고정 포트를 쓰지 않는다.
- 워크스페이스 터미널에서 `docker compose`를 직접 부르지 말고 `pnpm db:up`/`db:down`을 쓴다(워크스페이스 포트를 읽어 온다).

개인별 스크립트 변경은 공유 `config.json`이 아니라 gitignore된 `.superset/config.local.json`(`before`/`after` 배열 지원)에 둔다.
