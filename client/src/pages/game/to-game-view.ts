import {
  ChatEmoji,
  GAME_RECONNECT_GRACE_MS,
  GamePlayerStatus,
  GameStatus,
  RoomRole,
  BELL_MOVE_INPUT_LOCK_MS,
  BELL_MOVE_MS,
  SKILL_CAST_MS,
  SKILL_PICK_TIME_MS,
  SKILL_SLOT_COUNT,
  SkillId,
  SkillTiming,
  SkillUser,
  TIME_STOP_MS,
  TURN_TIME_MS,
  skillById,
} from '@nlmlio/shared';
import type {
  ChatEmojiCode,
  Fruit,
  GameSnapshot,
  RoomResponse,
  SkillStateEvent,
  TimeStopPublic,
} from '@nlmlio/shared';
import type { BellEvent, CardEvent, RatCrushEvent, SkillCastEvent } from '../../stores/game-store';
import type { LogEntry as RoomLogEntry } from '../../stores/room-store';
import { colorOf } from '../room/member-color';
import { noticeText } from '../room/RoomChat';
import {
  FRUIT_NAMES,
  type Banner,
  type GameView,
  type RatView,
  type LogEntry,
  type PlayerColor,
  type PlayerView,
  type BellMoveView,
  type RankingEntry,
  type SkillCastView,
  type SkillTargeting,
  type Verdict,
} from './game-view';
import type { SkillsView } from './skill/skill-view';

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
  /** 서버가 본인에게 보낸 보유 스킬·선택 후보 */
  skills: SkillStateEvent | null;
  /** 방금 서버가 알린 스킬 사용 */
  recentSkills: SkillCastEvent[];
  spitHit?: { key: number; endsAt: number };
  ratCrush?: RatCrushEvent | null;
  /** 대상 지정 중인 슬롯. 아니면 null */
  targetingSlot: number | null;
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

/** 손 개 쌔게 내려치기를 맞은 손의 회복 단계(3→1). 맞지 않았으면 undefined */
export const smashStageOf = (snapshot: GameSnapshot, userId: number): 1 | 2 | 3 | undefined =>
  snapshot.smashed.find((entry) => entry.userId === userId)?.stage;

const secondsLeft = (until: number, now: number, max: number) =>
  Math.min(max, Math.max(0, Math.ceil((until - now) / 1000)));

function verdictOf(input: GameViewInput, bell: BellEvent): Verdict {
  const { action, tableBefore } = bell;
  const ringer = input.snapshot.players.find((player) => player.userId === action.userId);
  const ringerView = {
    nickname: ringer?.nickname ?? '',
    color: playerColor(input.snapshot, input.room, action.userId),
  };
  if (action.fake)
    return {
      tone: 'misfire',
      ringer: ringerView,
      formula: '가짜 종!',
      detail: `상대에게 한 장씩 총 ${action.penaltyCards ?? 0}장 · 테이블 ${action.movedCards}장 보관`,
    };
  if (action.mined)
    return {
      tone: 'misfire',
      ringer: ringerView,
      title: '지뢰 폭발!',
      formula: '테이블 카드를 종 아래에 보관해요',
      detail: `성공도 오발도 아니에요 · 카드 ${action.movedCards}장이 모두 종 아래로`,
    };
  if (action.revolver?.fired === 'live')
    return {
      tone: 'misfire',
      ringer: ringerView,
      title: '탕! 실탄!',
      formula: '리볼버에서 실탄이 나왔어요',
      detail: `성공도 오발도 아니에요 · 카드 ${action.movedCards}장이 모두 종 아래로`,
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
    detail: `상대에게 한 장씩 총 ${action.penaltyCards ?? 0}장 · 테이블 ${action.movedCards}장은 모두 종 아래로`,
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
              text: action.mined
                ? `지뢰 폭발 · 테이블 ${action.movedCards}장 보관`
                : action.revolver?.fired === 'live'
                  ? `실탄 발사 · 테이블 ${action.movedCards}장 보관`
                  : `오발 · 상대에게 ${action.penaltyCards ?? 0}장 · 테이블 ${action.movedCards}장 보관`,
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
      case 'skill': {
        const target =
          action.targetUserId === null
            ? null
            : snapshot.players.find((player) => player.userId === action.targetUserId)?.nickname;
        const reflected = action.reflectedBy?.length
          ? action.reflectedBy
              .map((id) => snapshot.players.find((player) => player.userId === id)?.nickname)
              .join('·')
          : undefined;
        return {
          kind: 'event',
          id,
          tone: 'success',
          nickname,
          text: `${skillById(action.skillId).name} 사용${target ? ` → ${target}` : ''}${reflected ? ` · ${reflected}님의 무지개 반사!` : ''}`,
        };
      }
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
    if (bellBreakAt(snapshot, input.serverNow))
      return { tone: 'accent', messages: ['종이 돌아오면 마지막 종 기회가 열려요'] };
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

const nicknameOf = (input: GameViewInput, userId: number): string =>
  input.snapshot.players.find((player) => player.userId === userId)?.nickname ??
  input.room?.members.find((member) => member.userId === userId)?.nickname ??
  '';

/** 방금 쓴 스킬 알림. 1.6초가 지나면 사라진다(Figma Skill Cast Banner) */
function skillCastOf(input: GameViewInput, cast: SkillCastEvent): SkillCastView {
  const { action } = cast;
  return {
    key: cast.id,
    caster: nicknameOf(input, action.userId),
    casterId: String(action.userId),
    skillId: action.skillId,
    target: action.targetUserId === null ? null : nicknameOf(input, action.targetUserId),
    targetId: action.targetUserId === null ? null : String(action.targetUserId),
    ...(action.reflectedBy?.length
      ? {
          reflectedBy: action.reflectedBy.map((id) => nicknameOf(input, id)),
          reflectedById: action.reflectedBy.map(String),
        }
      : {}),
  };
}

/** 쥐의 자리와 압착은 공개, 보상·도착 좌석은 소유자 전용 서버 결과로만 그린다. */
function ratOf({
  snapshot,
  skills,
  userId,
  ratCrush,
  now,
  serverNow,
}: GameViewInput): RatView | undefined {
  const pending = snapshot.rat;
  if (pending && (!ratCrush || ratCrush.revision <= snapshot.revision))
    return { key: pending.endsAt, phase: 'waiting', cardCount: pending.cardCount };

  if (ratCrush && now - ratCrush.receivedAt < 1600)
    return {
      key: ratCrush.revision,
      phase: ratCrush.mined ? 'mined' : 'crushed',
      cardCount: ratCrush.cardCount,
    };
  const result = skills?.gameId === snapshot.gameId ? skills.ratResult : null;
  // 쥐가 깔리거나 지뢰에 죽은 것은 모두에게 공개된 `ratCrush`로 이미 그렸다.
  if (
    result &&
    result.outcome !== 'crushed' &&
    result.outcome !== 'mined' &&
    serverNow - result.at < 1800
  ) {
    return {
      key: result.at,
      phase: result.outcome,
      cardCount: result.cardCount,
      recipientId: String(userId),
    };
  }
  return undefined;
}

/** 대상 지정 스킬을 골랐으면 누를 수 있는 좌석(나를 뺀 플레이 중인 사람) */
function targetingOf(
  input: GameViewInput,
  skills: ReturnType<typeof skillsOf>,
): SkillTargeting | undefined {
  const slot = input.targetingSlot;
  const entry = slot === null ? undefined : skills?.slots[slot];
  if (slot === null || !entry?.skillId || !entry.usable) return undefined;
  if (skillById(entry.skillId).target !== 'one') return undefined;
  return {
    slot,
    skillId: entry.skillId,
    targetIds: input.snapshot.players
      .filter(
        (player) => player.status === GamePlayerStatus.ACTIVE && player.userId !== input.userId,
      )
      .map((player) => String(player.userId)),
  };
}

/**
 * 지금 이 스킬을 쓸 수 있어 보이는가. 진짜 판단은 서버가 하고(`SKILL_UNAVAILABLE`),
 * 화면은 흐리게 보일지·누르게 할지를 같은 기준으로 미리 정한다.
 */
export function skillUsable(
  snapshot: GameSnapshot,
  userId: number,
  skillId: SkillId,
  serverNow: number = Date.now(),
): boolean {
  if (snapshot.status !== GameStatus.PLAYING || snapshot.skillPick !== null) return false;
  const skill = skillById(skillId);
  const me = snapshot.players.find((player) => player.userId === userId);
  const role = me?.status === GamePlayerStatus.ACTIVE ? SkillUser.PLAYER : SkillUser.SPECTATOR;
  // 쥐새끼는 종 밑 보관 스택에 카드가 있어야 쓴다.
  if (skillId === SkillId.RAT && (snapshot.pileCount === 0 || !!snapshot.rat)) return false;
  // 도르마무는 판정 결과를 보여 주는 동안(되돌릴 수 있는 마감 전)에만 쓴다.
  if (
    skillId === SkillId.DORMAMMU &&
    (snapshot.rewindUntil === null || serverNow >= snapshot.rewindUntil)
  )
    return false;
  // 숫자 바꾸기는 과일 개수를 늘릴 수 있는 내 테이블 카드가 있어야 쓴다.
  if (skillId === SkillId.NUMBER_SHIFT) {
    const card = me?.topCard;
    if (!card || card.special || card.boosted || card.count >= 6) return false;
  }
  return (
    skill.available &&
    skill.timing !== SkillTiming.AUTOMATIC &&
    (skill.user === SkillUser.BOTH || skill.user === role)
  );
}

/** 시간 정지 중이면 쓴 사람과 끝나는 시각. 아니면 undefined */
export function timeStopAt(snapshot: GameSnapshot, serverNow: number): TimeStopPublic | undefined {
  const stop = snapshot.timeStop;
  return stop && snapshot.status === GameStatus.PLAYING && serverNow < stop.endsAt
    ? stop
    : undefined;
}

/** 종 야바위 중이면 종마다의 단축키와 남은 시간. 아니면 undefined */
export function shellAt(
  snapshot: GameSnapshot,
  serverNow: number,
): { keys: string[]; seconds: number } | undefined {
  const shell = snapshot.shell;
  if (!shell || snapshot.status !== GameStatus.PLAYING || serverNow >= shell.endsAt)
    return undefined;
  return { keys: shell.keys, seconds: Math.ceil((shell.endsAt - serverNow) / 1000) };
}

/** 서버가 정한 복구 시각까지 종 입력을 막는다. */
export function bellBreakAt(snapshot: GameSnapshot, serverNow: number): boolean {
  return (
    snapshot.status === GameStatus.PLAYING &&
    !!snapshot.bellBreak &&
    serverNow < snapshot.bellBreak.endsAt
  );
}

/** 종 옮기기가 진행 중이면 옮겨진 자리·새 키. 끝나는 시각은 서버가 정하고 화면은 서버 시각으로 센다 */
export function bellMoveAt(snapshot: GameSnapshot, serverNow: number): BellMoveView | undefined {
  const move = snapshot.bellMove;
  if (!move || snapshot.status !== GameStatus.PLAYING || serverNow >= move.endsAt) return undefined;
  return {
    position: move.position,
    key: move.key,
    // 옮겨지는 연출 중 처음 300ms는 종 입력을 무시한다
    locked: serverNow < move.endsAt - BELL_MOVE_MS + BELL_MOVE_INPUT_LOCK_MS,
  };
}

/** 서버가 보낸 내 스킬 상태 → 슬롯과 선택 창. 아직 못 받았거나 다른 게임의 것이면 만들지 않는다 */
function skillsOf(input: GameViewInput): SkillsView | undefined {
  const { snapshot, skills } = input;
  if (snapshot.status !== GameStatus.PLAYING || !skills || skills.gameId !== snapshot.gameId)
    return undefined;
  const slots = Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => {
    const skillId = skills.slots[index] ?? null;
    return {
      skillId,
      usable: skillId === null || skillUsable(snapshot, input.userId, skillId, input.serverNow),
    };
  });
  const open = snapshot.skillPick;
  const pick = skills.pick;
  if (!open || !pick) return { slots };
  const chosen = pick.candidate !== null || pick.declined;
  return {
    slots,
    pick: {
      role: pick.role === RoomRole.SPECTATOR ? 'spectator' : 'player',
      round: snapshot.round,
      pickNo: open.pickNo,
      candidates: pick.candidates,
      chosenCandidate: pick.candidate,
      placedSlot: pick.slot,
      declined: pick.declined,
      secondsLeft: secondsLeft(open.deadline, input.serverNow, SKILL_PICK_TIME_MS / 1000),
      // 나를 뺀 다른 사람들의 선택 진행
      progress: {
        done: Math.max(0, open.done - (chosen ? 1 : 0)),
        total: Math.max(0, open.total - 1),
      },
    },
  };
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
      burning: snapshot.burning.includes(player.userId),
      smashed: smashStageOf(snapshot, player.userId),
      turnSeconds: isTurn ? turnSeconds : undefined,
      cardKey: card?.id,
      autoPlayed: card?.automatic ?? false,
      emote: emoji ? ChatEmoji[emoji.emoji] : undefined,
      emoteKey: emoji?.id,
      outcome:
        bell && ringer
          ? bell.action.mined
            ? { tone: 'misfire', label: '지뢰!' }
            : bell.action.success
              ? { tone: 'win', label: `WIN +${bell.action.movedCards}` }
              : { tone: 'misfire', label: '오발' }
          : bell?.action.penaltyRecipients?.includes(player.userId)
            ? { tone: 'receive', label: '덱 +1' }
            : undefined,
    };
  });
  if (!seated)
    players.unshift({
      id: 'me',
      nickname:
        input.room?.members.find((member) => member.userId === userId)?.nickname ?? input.nickname,
      color: 'white',
      deckCount: 0,
      topCard: null,
      state: 'out',
      isTurn: false,
      emote: input.emojis[userId] ? ChatEmoji[input.emojis[userId].emoji] : undefined,
      emoteKey: input.emojis[userId]?.id,
    });

  const me = snapshot.players[seat];
  const stop = timeStopAt(snapshot, input.serverNow);
  const stopByMe = stop?.userId === userId;
  const burnedSelf = snapshot.burning.includes(userId);
  const basePhase =
    !me || me.status !== GamePlayerStatus.ACTIVE
      ? 'spectating'
      : bell
        ? 'judging'
        : snapshot.turnUserId === userId
          ? 'turn'
          : 'waiting';
  // 시간 정지 중에는 쓴 사람만 카드를 낼 수 있고(차례와 무관), 아마테라스에 걸리면 못 낸다.
  const myPhase =
    basePhase === 'spectating' || basePhase === 'judging'
      ? basePhase
      : burnedSelf
        ? 'waiting'
        : stop
          ? stopByMe
            ? 'turn'
            : 'waiting'
          : basePhase;
  const frozen =
    basePhase === 'spectating'
      ? undefined
      : burnedSelf
        ? 'amaterasu'
        : stop && !stopByMe
          ? 'time-stop'
          : undefined;
  const turnPlayer = snapshot.players.find((player) => player.userId === snapshot.turnUserId);
  const skills = skillsOf(input);
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
    smashed: smashStageOf(snapshot, userId),
    revolver: snapshot.status === GameStatus.PLAYING ? (snapshot.revolver ?? undefined) : undefined,
    bell: bell
      ? { kind: bell.action.success ? 'success' : 'misfire' }
      : playing && snapshot.turnUserId === null
        ? { kind: 'last-chance', value: turnSeconds ?? 0 }
        : { kind: 'idle' },
    banner: bannerOf(input, seated),
    verdict: bell ? verdictOf(input, bell) : undefined,
    log: logOf(input),
    skills,
    skillCasts: input.recentSkills
      .filter((cast) => input.now - cast.castAt < SKILL_CAST_MS)
      .map((cast) => skillCastOf(input, cast)),
    rat: ratOf(input),
    targeting: targetingOf(input, skills),
    bellMove: bellMoveAt(snapshot, input.serverNow),
    bellBreak: bellBreakAt(snapshot, input.serverNow),
    shell: shellAt(snapshot, input.serverNow),
    hackKey:
      input.skills?.gameId === snapshot.gameId && snapshot.status === GameStatus.PLAYING
        ? (input.skills.hackKey ?? undefined)
        : undefined,
    timeStop: stop && {
      caster: nicknameOf(input, stop.userId),
      byMe: stopByMe,
      intro: input.serverNow < stop.startsAt,
      // 시작 연출 동안은 5초 그대로이고, 연출이 끝난 뒤부터 센다.
      seconds:
        input.serverNow < stop.startsAt
          ? TIME_STOP_MS / 1000
          : secondsLeft(stop.endsAt, input.serverNow, 99),
    },
    frozen,
    spit: input.spitHit && input.now < input.spitHit.endsAt ? input.spitHit : undefined,
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
