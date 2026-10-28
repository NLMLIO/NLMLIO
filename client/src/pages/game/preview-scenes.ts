import type { CardFace, GameView, PlayerView, RankingEntry } from './game-view';

/**
 * 게임 엔진·소켓이 붙기 전까지 화면을 확인하는 미리보기 데이터.
 * Figma NLML_design 「03 · 게임」 섹션의 화면 9개와 같은 상태를 담는다.
 */

const card = (fruit: CardFace['fruit'], count: CardFace['count']): CardFace => ({ fruit, count });

function player(
  id: string,
  nickname: string,
  color: PlayerView['color'],
  deckCount: number,
  topCard: CardFace | null,
  extra: Partial<PlayerView> = {},
): PlayerView {
  return { id, nickname, color, deckCount, topCard, state: 'active', isTurn: false, ...extra };
}

const ROOM_NAME = '점심 내기 한판';

export const PREVIEW_SCENES = {
  /** 05B · 게임 시작 · 카드 분배 */
  dealing: {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 14, null),
      player('p1', '딸기러버', 'strawberry', 14, null),
      player('p2', '바나나킥', 'banana', 14, null),
      player('p3', '자두씨', 'plum', 14, null),
    ],
    myPhase: 'first',
    pileCount: 0,
    bell: { kind: 'countdown', value: 3 },
    banner: {
      tone: 'accent',
      messages: ['게임 시작! 카드 56장을 14장씩 나눴어요', '첫 차례는 과일왕'],
    },
    log: [
      { kind: 'system', id: 'l1', text: '게임을 시작합니다 · 카드 14장씩 분배' },
      { kind: 'chat', id: 'l2', nickname: '딸기러버', color: 'strawberry', text: '긴장된다' },
      { kind: 'chat', id: 'l3', nickname: '바나나킥', color: 'banana', text: '손 풀었음' },
      { kind: 'system', id: 'l4', text: '첫 차례 과일왕' },
    ],
  },
  /** 06 · 게임 · 내 차례 */
  'my-turn': {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 14, card('STRAWBERRY', 3), { isTurn: true }),
      player('p1', '딸기러버', 'strawberry', 18, card('LIME', 2)),
      player('p2', '바나나킥', 'banana', 9, card('STRAWBERRY', 4)),
      player('p3', '자두씨', 'plum', 15, card('PLUM', 1)),
    ],
    myPhase: 'turn',
    pileCount: 0,
    bell: { kind: 'idle' },
    log: [
      {
        kind: 'chat',
        id: 'l1',
        nickname: '딸기러버',
        color: 'strawberry',
        text: '방금 그거 5개 아니었어?',
      },
      { kind: 'event', id: 'l2', tone: 'success', nickname: '딸기러버', text: '종 성공 · +6장' },
      { kind: 'chat', id: 'l3', nickname: '바나나킥', color: 'banana', text: '손 빠르네' },
      { kind: 'system', id: 'l4', text: '자두씨 차례 → 과일왕 차례' },
      { kind: 'chat', id: 'l5', nickname: '자두씨', color: 'plum', text: 'ㅠㅠ' },
    ],
  },
  /** 15 · 게임 · 다른 사람 차례 · 이모티콘 · 연결 끊김 */
  'others-turn': {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 12, card('BANANA', 2)),
      player('p1', '딸기러버', 'strawberry', 16, card('LIME', 2), { emote: '!!' }),
      player('p2', '바나나킥', 'banana', 8, card('BANANA', 3), {
        state: 'offline',
        offlineSeconds: 21,
      }),
      player('p3', '자두씨', 'plum', 14, card('PLUM', 1), { isTurn: true }),
    ],
    myPhase: 'waiting',
    turnNickname: '자두씨',
    pileCount: 4,
    bell: { kind: 'idle' },
    log: [
      { kind: 'chat', id: 'l1', nickname: '과일왕', color: 'lime', text: '바나나 2장 냈어요' },
      { kind: 'system', id: 'l2', text: '바나나킥님 연결 끊김 · 30초 대기' },
      { kind: 'chat', id: 'l3', nickname: '딸기러버', color: 'strawberry', text: '!!' },
      { kind: 'system', id: 'l4', text: '과일왕 차례 → 자두씨 차례' },
    ],
  },
  /** 18 · 게임 · 2인 배치 */
  'two-players': {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 23, card('LIME', 2), { isTurn: true }),
      player('p1', '딸기러버', 'strawberry', 25, card('LIME', 3)),
    ],
    myPhase: 'turn',
    pileCount: 0,
    bell: { kind: 'idle' },
    log: [
      { kind: 'chat', id: 'l1', nickname: '딸기러버', color: 'strawberry', text: '1:1이다' },
      { kind: 'system', id: 'l2', text: '딸기러버 차례 → 과일왕 차례' },
    ],
  },
  /** 19 · 게임 · 6인 배치 */
  'six-players': {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 8, card('PLUM', 3), { isTurn: true }),
      player('p1', '딸기러버', 'strawberry', 9, card('BANANA', 1)),
      player('p2', '바나나킥', 'banana', 7, card('PLUM', 2)),
      player('p3', '자두씨', 'plum', 10, card('STRAWBERRY', 2), { emote: 'GG' }),
      player('p4', '번개손', 'white', 11, card('BANANA', 4)),
      player('p5', '라임라임', 'lime', 0, null, { state: 'out' }),
    ],
    myPhase: 'turn',
    pileCount: 0,
    bell: { kind: 'idle' },
    log: [
      { kind: 'event', id: 'l1', tone: 'danger', nickname: '라임라임', text: '카드 0장 · 탈락' },
      { kind: 'chat', id: 'l2', nickname: '자두씨', color: 'plum', text: 'GG' },
      { kind: 'system', id: 'l3', text: '번개손 차례 → 과일왕 차례' },
    ],
  },
  /** 07A · 종 판정 · 성공 */
  'bell-success': {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 13, card('STRAWBERRY', 1)),
      player('p1', '딸기러버', 'strawberry', 28, card('LIME', 2), {
        outcome: { tone: 'win', label: 'WIN +10' },
      }),
      player('p2', '바나나킥', 'banana', 9, card('STRAWBERRY', 2)),
      player('p3', '자두씨', 'plum', 15, card('LIME', 3)),
    ],
    myPhase: 'judging',
    pileCount: 0,
    bell: { kind: 'success' },
    banner: {
      tone: 'accent',
      messages: ['딸기러버 종 성공! 라임 2 + 3 = 5', '테이블 6장 + 보관 4장 = +10장'],
    },
    verdict: {
      tone: 'success',
      ringer: { nickname: '딸기러버', color: 'strawberry' },
      formula: '라임 2 + 3 = 5',
      detail: '테이블 카드 6장 + 종 아래 보관 4장 · +10장 획득',
    },
    log: [
      { kind: 'chat', id: 'l1', nickname: '자두씨', color: 'plum', text: '라임 3장' },
      { kind: 'event', id: 'l2', tone: 'success', nickname: '딸기러버', text: '종 성공 · +10장' },
      { kind: 'chat', id: 'l3', nickname: '바나나킥', color: 'banana', text: '손 빠르네' },
    ],
  },
  /** 07B · 종 판정 · 오발 */
  // 오발 벌칙(FUNC-005-08): 바나나킥이 덱 맨 위 카드를 다음 자리부터(자두씨 → 과일왕 → 딸기러버) 1장씩 준다.
  // 테이블 카드와 보관 스택은 그대로다.
  'bell-misfire': {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 14, card('BANANA', 1)),
      player('p1', '딸기러버', 'strawberry', 18, card('STRAWBERRY', 4), {
        outcome: { tone: 'receive', label: '+1' },
      }),
      player('p2', '바나나킥', 'banana', 2, card('BANANA', 2), {
        outcome: { tone: 'misfire', label: '오발 −3' },
      }),
      player('p3', '자두씨', 'plum', 15, card('PLUM', 1), {
        outcome: { tone: 'receive', label: '+1' },
      }),
    ],
    myPhase: 'judging',
    pileCount: 4,
    bell: { kind: 'misfire' },
    banner: {
      tone: 'danger',
      messages: ['오발! 바나나킥 · 5개인 과일이 없어요', '다른 플레이어 3명에게 1장씩'],
    },
    verdict: {
      tone: 'misfire',
      ringer: { nickname: '바나나킥', color: 'banana' },
      formula: '딸기 4 · 바나나 3 · 자두 1',
      detail: '5개인 과일이 없어요 · 자두씨 → 과일왕 → 딸기러버에게 1장씩',
    },
    log: [
      { kind: 'chat', id: 'l1', nickname: '바나나킥', color: 'banana', text: '바나나 2장' },
      {
        kind: 'event',
        id: 'l2',
        tone: 'danger',
        nickname: '바나나킥',
        text: '오발 · 3명에게 1장씩',
      },
      { kind: 'system', id: 'l3', text: '자두씨 · 과일왕 · 딸기러버 +1장' },
      { kind: 'chat', id: 'l4', nickname: '딸기러버', color: 'strawberry', text: 'ㅋㅋ' },
    ],
  },
  /** 16 · 게임 · 탈락 후 관전 */
  spectating: {
    roomName: ROOM_NAME,
    players: [
      player('me', '과일왕', 'lime', 0, null, { state: 'out' }),
      player('p1', '딸기러버', 'strawberry', 27, card('STRAWBERRY', 1), { isTurn: true }),
      player('p2', '바나나킥', 'banana', 0, null, { state: 'out' }),
      player('p3', '자두씨', 'plum', 29, card('LIME', 4), { emote: 'ㅠㅠ' }),
    ],
    myPhase: 'spectating',
    pileCount: 1,
    bell: { kind: 'idle' },
    banner: {
      tone: 'danger',
      messages: ['카드를 모두 잃어 탈락했어요 · 4위로 기록됩니다', '끝날 때까지 관전할 수 있어요'],
    },
    log: [
      { kind: 'event', id: 'l1', tone: 'danger', nickname: '과일왕', text: '카드 0장 · 탈락' },
      { kind: 'chat', id: 'l2', nickname: '자두씨', color: 'plum', text: 'ㅠㅠ' },
      { kind: 'system', id: 'l3', text: '딸기러버 차례' },
    ],
  },
} satisfies Record<string, GameView>;

/** 08 · 게임 결과 · 최종 순위 */
export const PREVIEW_RANKING: RankingEntry[] = [
  { rank: 1, nickname: '과일왕', color: 'lime', isMe: true },
  { rank: 2, nickname: '딸기러버', color: 'strawberry', isMe: false },
  { rank: 3, nickname: '자두씨', color: 'plum', isMe: false },
  { rank: 4, nickname: '바나나킥', color: 'banana', isMe: false },
];

export type PreviewScene = keyof typeof PREVIEW_SCENES | 'result';
