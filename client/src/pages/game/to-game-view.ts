import {
  ChatEmoji,
  GAME_RECONNECT_GRACE_MS,
  GamePlayerStatus,
  GameStatus,
  TURN_TIME_MS,
} from '@nlmlio/shared';
import type { ChatEmojiCode, Fruit, GameSnapshot, RoomResponse } from '@nlmlio/shared';
import type { BellEvent, CardEvent } from '../../stores/game-store';
import type { LogEntry as RoomLogEntry } from '../../stores/room-store';
import { colorOf } from '../room/member-color';
import { noticeText } from '../room/RoomChat';
import {
  FRUIT_NAMES,
  type Banner,
  type GameView,
  type LogEntry,
  type PlayerColor,
  type PlayerView,
  type RankingEntry,
  type Verdict,
} from './game-view';

/**
 * 서버 스냅샷 → 화면 모델 변환. 판정·순위·카드 수는 서버가 보낸 값을 그대로 옮기고,
 * 여기서는 순서 돌리기(내가 아래), 색, 남은 초, 문구 같은 표시만 정한다.
 */
export interface GameViewInput {
  snapshot: GameSnapshot;
  userId: number;
  nickname: string;
  room: RoomResponse | null;
  log: RoomLogEntry[];
  emojis: Record<number, { emoji: ChatEmojiCode; id?: number }>;
  /** 화면에 보여 주는 중인 종 판정. 표시 시간이 지나면 null */
  bell: BellEvent | null;
  lastCards: Record<number, CardEvent>;
  offlineSince: Record<number, number>;
  /** 서버 시각으로 맞춘 지금 */
  serverNow: number;
  /** 이 브라우저 시각 */
  now: number;
  error?: string;
}

const FALLBACK_COLORS: PlayerColor[] = ['lime', 'strawberry', 'banana', 'plum', 'white', '#5ec8ff'];
const FRUIT_ORDER: Fruit[] = ['STRAWBERRY', 'BANANA', 'LIME', 'PLUM'];

export function playerColor(
  snapshot: GameSnapshot,
  room: RoomResponse | null,
  userId: number,
): PlayerColor {
  if (room?.members.some((member) => member.userId === userId))
    return colorOf(room, userId) as PlayerColor;
  const seat = snapshot.players.findIndex((player) => player.userId === userId);
  return FALLBACK_COLORS[Math.max(seat, 0) % FALLBACK_COLORS.length];
}

const secondsLeft = (until: number, now: number, max: number) =>
  Math.min(max, Math.max(0, Math.ceil((until - now) / 1000)));

function verdictOf(input: GameViewInput, bell: BellEvent): Verdict {
  const { action, tableBefore } = bell;
  const ringer = input.snapshot.players.find((player) => player.userId === action.userId);
  const ringerView = {
    nickname: ringer?.nickname ?? '',
    color: playerColor(input.snapshot, input.room, action.userId),
  };
  if (action.success) {
    const fruit = FRUIT_ORDER.find((name) => action.totals[name] === 5) ?? 'STRAWBERRY';
    const counts = tableBefore
      .filter(({ card }) => card.fruit === fruit)
      .map(({ card }) => card.count);
    return {
      tone: 'success',
      ringer: ringerView,
      formula: `${FRUIT_NAMES[fruit]} ${counts.length > 1 ? `${counts.join(' + ')} = 5` : '5'}`,
      detail: `테이블과 종 아래 보관 카드 · +${action.movedCards}장 획득`,
    };
  }
  const visible = FRUIT_ORDER.filter((name) => action.totals[name] > 0);
  return {
    tone: 'misfire',
    ringer: ringerView,
    formula: visible.length
      ? visible.map((name) => `${FRUIT_NAMES[name]} ${action.totals[name]}`).join(' · ')
      : '테이블이 비어 있어요',
    detail: `5개인 과일이 없어요 · 내 덱 ${action.movedCards}장만 종 아래로 · 테이블은 유지돼요`,
  };
}

function logOf(input: GameViewInput): LogEntry[] {
  const { snapshot, room } = input;
  return input.log.map((entry): LogEntry => {
    const id = String(entry.id);
    if (entry.kind === 'chat')
      return {
        kind: 'chat',
        id,
        nickname: entry.nickname,
        color: playerColor(snapshot, room, entry.userId),
        text: entry.message,
        spectator: entry.isSpectator,
      };
    if (entry.kind === 'notice') return { kind: 'system', id, text: noticeText(entry.notice) };
    const { action, nickname } = entry;
    switch (action.kind) {
      case 'bell':
        return action.success
          ? {
              kind: 'event',
              id,
              tone: 'success',
              nickname,
              text: `종 성공 · +${action.movedCards}장`,
            }
          : {
              kind: 'event',
              id,
              tone: 'danger',
              nickname,
              text: `오발 · ${action.movedCards}장 보관 스택으로`,
            };
      case 'departed':
        return { kind: 'event', id, tone: 'danger', nickname, text: '이탈 · 관전으로 전환' };
      case 'connection':
        return {
          kind: 'system',
          id,
          text: action.connected
            ? `${nickname}님이 다시 연결됐어요`
            : `${nickname}님 연결 끊김 · ${GAME_RECONNECT_GRACE_MS / 1000}초 안에 돌아오지 않으면 이탈`,
        };
      case 'card':
        return { kind: 'system', id, text: `${nickname}님이 카드를 냈어요` };
    }
  });
}

function bannerOf(input: GameViewInput, seated: boolean): Banner | undefined {
  const { snapshot, userId, error } = input;
  if (error) return { tone: 'danger', messages: [error] };
  const me = snapshot.players.find((player) => player.userId === userId);
  if (!seated)
    return {
      tone: 'accent',
      messages: ['관전 중이에요', '게임이 끝나면 다음 판에 참가할 수 있어요'],
    };
  if (me?.status === GamePlayerStatus.ELIMINATED)
    return {
      tone: 'danger',
      messages: ['카드를 모두 잃어 탈락했어요', '끝날 때까지 관전할 수 있어요'],
    };
  if (me?.status === GamePlayerStatus.DEPARTED)
    return {
      tone: 'danger',
      messages: ['이탈 처리됐어요 · 패배로 기록돼요', '끝날 때까지 관전할 수 있어요'],
    };
  if (snapshot.status === GameStatus.PLAYING && snapshot.turnUserId === null) {
    const seconds =
      snapshot.turnDeadline === null
        ? undefined
        : secondsLeft(snapshot.turnDeadline, input.serverNow, TURN_TIME_MS / 1000);
    return {
      tone: 'accent',
      messages: [
        '모두 카드를 다 냈어요 · 지금 종을 칠 수 있어요',
        `${seconds === undefined ? '' : `${seconds}초 안에 `}아무도 종을 치지 않으면 마지막으로 카드를 낸 사람이 이겨요`,
      ],
    };
  }
  if (me?.status === GamePlayerStatus.ACTIVE && me.handCount === 0)
    return {
      tone: 'accent',
      messages: [
        '카드를 다 냈어요 · 차례 없이 종만 칠 수 있어요',
        '다음 종 판정 때 카드를 못 얻으면 탈락해요',
      ],
    };
  if (me && me.automaticTurns > 0)
    return {
      tone: 'danger',
      messages: [
        `시간이 지나 자동으로 냈어요 (${me.automaticTurns}/3)`,
        '3번 연속이면 이탈 처리돼요',
      ],
    };
  if (snapshot.round === 1 && snapshot.turnSeq === 0 && snapshot.status === GameStatus.PLAYING) {
    const first = snapshot.players.find((player) => player.userId === snapshot.turnUserId);
    return {
      tone: 'accent',
      messages: [
        `게임 시작! 카드를 ${snapshot.players[0]?.handCount ?? 0}장씩 나눴어요`,
        `첫 차례는 ${first?.userId === userId ? '나' : (first?.nickname ?? '')}`,
      ],
    };
  }
  return undefined;
}

export function toGameView(input: GameViewInput): GameView {
  const { snapshot, userId, bell } = input;
  const seat = snapshot.players.findIndex((player) => player.userId === userId);
  const seated = seat !== -1;
  const ordered = seated
    ? [...snapshot.players.slice(seat), ...snapshot.players.slice(0, seat)]
    : snapshot.players;
  const playing = snapshot.status === GameStatus.PLAYING;
  const turnSeconds =
    playing && snapshot.turnDeadline !== null
      ? secondsLeft(snapshot.turnDeadline, input.serverNow, TURN_TIME_MS / 1000)
      : undefined;

  const players: PlayerView[] = ordered.map((player) => {
    const active = player.status === GamePlayerStatus.ACTIVE;
    const offline = active && !player.connected;
    const since = input.offlineSince[player.userId];
    const isTurn = playing && player.userId === snapshot.turnUserId;
    const ringer = bell?.action.userId === player.userId;
    const emoji = input.emojis[player.userId];
    const card = input.lastCards[player.userId];
    return {
      id: String(player.userId),
      nickname: player.nickname,
      color: playerColor(snapshot, input.room, player.userId),
      deckCount: player.handCount,
      topCard: player.topCard,
      tableCount: player.tableCount,
      state: !active ? 'out' : offline ? 'offline' : 'active',
      offlineSeconds:
        offline && since !== undefined
          ? secondsLeft(since + GAME_RECONNECT_GRACE_MS, input.now, GAME_RECONNECT_GRACE_MS / 1000)
          : undefined,
      isTurn,
      turnSeconds: isTurn ? turnSeconds : undefined,
      cardKey: card?.id,
      autoPlayed: card?.automatic ?? false,
      emote: emoji ? ChatEmoji[emoji.emoji] : undefined,
      emoteKey: emoji?.id,
      outcome:
        bell && ringer
          ? bell.action.success
            ? { tone: 'win', label: `WIN +${bell.action.movedCards}` }
            : { tone: 'misfire', label: '오발' }
          : undefined,
    };
  });
  if (!seated)
    players.unshift({
      id: 'me',
      nickname: input.nickname,
      color: 'white',
      deckCount: 0,
      topCard: null,
      state: 'out',
      isTurn: false,
      emote: input.emojis[userId] ? ChatEmoji[input.emojis[userId].emoji] : undefined,
      emoteKey: input.emojis[userId]?.id,
    });

  const me = snapshot.players[seat];
  const myPhase =
    !me || me.status !== GamePlayerStatus.ACTIVE
      ? 'spectating'
      : bell
        ? 'judging'
        : snapshot.turnUserId === userId
          ? 'turn'
          : 'waiting';
  const turnPlayer = snapshot.players.find((player) => player.userId === snapshot.turnUserId);
  return {
    roomName: snapshot.roomName,
    players,
    selfSeated: seated,
    spectators: input.room?.members
      .filter(
        (member) =>
          !snapshot.players.some(
            (player) =>
              player.userId === member.userId && player.status === GamePlayerStatus.ACTIVE,
          ),
      )
      .map((member) => ({
        id: String(member.userId),
        nickname: member.nickname,
        emote: input.emojis[member.userId]
          ? ChatEmoji[input.emojis[member.userId].emoji]
          : undefined,
        emoteKey: input.emojis[member.userId]?.id,
      })),
    myPhase,
    turnNickname: turnPlayer?.nickname,
    myTurnSeconds: myPhase === 'turn' ? turnSeconds : undefined,
    pileCount: snapshot.pileCount,
    bell: bell
      ? { kind: bell.action.success ? 'success' : 'misfire' }
      : playing && snapshot.turnUserId === null
        ? { kind: 'last-chance', value: turnSeconds ?? 0 }
        : { kind: 'idle' },
    banner: bannerOf(input, seated),
    verdict: bell ? verdictOf(input, bell) : undefined,
    log: logOf(input),
  };
}

export function toRanking(
  snapshot: GameSnapshot,
  room: RoomResponse | null,
  userId: number,
): RankingEntry[] {
  return [...snapshot.results]
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => ({
      rank: entry.rank,
      nickname: entry.nickname,
      color: playerColor(snapshot, room, entry.userId),
      isMe: entry.userId === userId,
      departed: entry.departed,
    }));
}
