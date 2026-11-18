import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ErrorCode,
  GameClientEvent,
  GamePlayerStatus,
  GameStatus,
  RoomStatus,
} from '@nlmlio/shared';
import { skillById } from '@nlmlio/shared';
import type { PublicUser, SkillChoice } from '@nlmlio/shared';
import { ApiError, api, errorMessage } from '../../api/http';
import { playSound } from '../../audio/sounds';
import { useGameShortcuts } from '../../hooks/use-game-shortcuts';
import { sendChat, sendGameIntent } from '../../socket/socket';
import { useGameStore } from '../../stores/game-store';
import { useRoomStore } from '../../stores/room-store';
import { GameBoard, type GameActions } from './GameBoard';
import { GameFrame } from './GameFrame';
import { GameResult } from './GameResult';
import { bellMoveAt, skillUsable, toGameView, toRanking } from './to-game-view';

/** 의도 실패 안내를 띄워 두는 시간 */
const ERROR_MS = 2500;

/**
 * 실제 게임 화면(FUNC-005). 서버가 보낸 스냅샷·이벤트만 그리고, 카드 내기·종·결과 확인은 «의도»로만 보낸다.
 * 종소리는 누르는 즉시, 판정 결과의 효과음과 화면 변화는 서버 이벤트를 받은 뒤에 낸다(CLAUDE.md 6.2).
 */
export function GamePage({
  user,
  onLobby,
  onWaitingRoom,
}: {
  user: PublicUser;
  onLobby: () => void;
  onWaitingRoom: () => void;
}) {
  const snapshot = useGameStore((state) => state.snapshot);
  const lastBell = useGameStore((state) => state.lastBell);
  const lastCards = useGameStore((state) => state.lastCards);
  const offlineSince = useGameStore((state) => state.offlineSince);
  const clockOffset = useGameStore((state) => state.clockOffset);
  const skills = useGameStore((state) => state.skills);
  const skillCast = useGameStore((state) => state.lastSkill);
  const room = useRoomStore((state) => state.room);
  const roomSynced = useRoomStore((state) => state.synced);
  const log = useRoomStore((state) => state.log);
  const emojis = useRoomStore((state) => state.emojis);

  const [now, setNow] = useState(() => Date.now());
  const [strike, setStrike] = useState<{ id: number; playerId: string }>();
  const strikeId = useRef(0);
  const [error, setError] = useState('');
  /** 대상 지정 스킬을 골라 좌석을 누르길 기다리는 슬롯 */
  const [targetingSlot, setTargetingSlot] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [returning, setReturning] = useState(false);
  const rungSeq = useRef<string | null>(null);
  const playInFlight = useRef(false);
  const cancelLeave = useCallback(() => setConfirmLeave(false), []);

  // 남은 턴·유예 시간을 줄여 보이게 하는 화면 시계. 판정은 서버 마감 시각으로만 한다.
  const live = snapshot?.status === GameStatus.PLAYING;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (!lastBell) return;
    if (lastBell.action.userId !== user.id || rungSeq.current === null)
      setStrike({ id: ++strikeId.current, playerId: String(lastBell.action.userId) });
  }, [lastBell, user.id]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), ERROR_MS);
    return () => clearTimeout(timer);
  }, [error]);

  // 볼 게임이 없으면(결과 확인 후, 재접속했더니 끝난 뒤) 방이 남아 있으면 대기실로, 없으면 로비로 간다(003-07).
  const waitingForGame = room?.status === RoomStatus.PLAYING;
  useEffect(() => {
    if (snapshot || !roomSynced || waitingForGame) return;
    if (room) onWaitingRoom();
    else onLobby();
  }, [snapshot, roomSynced, waitingForGame, room, onWaitingRoom, onLobby]);

  const me = snapshot?.players.find((player) => player.userId === user.id);
  const canAct = live && me?.status === GamePlayerStatus.ACTIVE;
  const myTurn = canAct && snapshot?.turnUserId === user.id;
  const judging = live && (snapshot?.roundResumeAt ?? 0) > now + clockOffset;
  // 스킬 선택 중에는 게임이 멈춘다(FUNC-009-01). 카드 내기·종은 서버도 무시한다.
  const picking = live && !!snapshot?.skillPick;
  const bellMoved = snapshot ? bellMoveAt(snapshot, now + clockOffset) : undefined;

  function isPaused() {
    const current = useGameStore.getState();
    return (
      (current.snapshot?.roundResumeAt ?? 0) > Date.now() + current.clockOffset ||
      !!current.snapshot?.skillPick
    );
  }

  async function playCard() {
    if (!snapshot || !myTurn || playInFlight.current || isPaused()) return;
    playInFlight.current = true;
    setPlaying(true);
    const failure = await sendGameIntent(GameClientEvent.PLAY, {
      gameId: snapshot.gameId,
      turnId: snapshot.turnId,
    });
    setPlaying(false);
    playInFlight.current = false;
    if (failure) setError(failure);
  }

  function ringBell() {
    if (!snapshot || !canAct || isPaused()) return;
    // 종이 옮겨지는 중(처음 300ms)에는 종 입력을 무시한다(종 옮기기).
    const current = useGameStore.getState();
    if (bellMoveAt(snapshot, Date.now() + current.clockOffset)?.locked) return;
    // 같은 공개 테이블에 대한 종은 서버가 한 번만 판정하므로 다시 보내지 않는다.
    const key = `${snapshot.gameId}:${snapshot.turnSeq}`;
    playSound('bell');
    setStrike({ id: ++strikeId.current, playerId: String(user.id) });
    if (rungSeq.current === key) return;
    rungSeq.current = key;
    void sendGameIntent(GameClientEvent.BELL, {
      gameId: snapshot.gameId,
      turnSeq: snapshot.turnSeq,
    }).then((failure) => {
      if (!failure) return;
      setError(failure);
      if (rungSeq.current === key) rungSeq.current = null;
    });
  }

  /** 후보 칸 선택(FUNC-009-03): 결과는 서버가 보내는 상태로만 화면에 반영한다 */
  /**
   * 슬롯의 스킬 사용(FUNC-009-04). 대상이 필요 없으면 바로 보내고, 대상 지정 스킬이면 좌석을 눌러
   * 대상을 고르게 한다. 쓸 수 있는지는 서버가 다시 검사한다.
   */
  function useSkillSlot(slot: number) {
    const id = skills?.slots[slot];
    if (!snapshot || !id || !skillUsable(snapshot, user.id, id)) return;
    if (skillById(id).target === 'one') {
      setTargetingSlot((current) => (current === slot ? null : slot));
      return;
    }
    setTargetingSlot(null);
    void sendGameIntent(GameClientEvent.SKILL_USE, { gameId: snapshot.gameId, slot }).then(
      (failure) => {
        if (failure) setError(failure);
      },
    );
  }

  function pickTarget(targetUserId: number) {
    if (!snapshot || targetingSlot === null) return;
    const slot = targetingSlot;
    setTargetingSlot(null);
    void sendGameIntent(GameClientEvent.SKILL_USE, {
      gameId: snapshot.gameId,
      slot,
      targetUserId,
    }).then((failure) => {
      if (failure) setError(failure);
    });
  }

  function pickSkill(choice: SkillChoice) {
    if (!snapshot) return;
    void sendGameIntent(GameClientEvent.SKILL_PICK, { gameId: snapshot.gameId, choice }).then(
      (failure) => {
        if (failure) setError(failure);
      },
    );
  }

  async function leaveRoom() {
    if (leaving) return;
    setLeaving(true);
    try {
      await api<void>('/rooms/me/leave', { method: 'POST' });
      onLobby();
    } catch (cause) {
      // 이미 방에 없다면 나가려던 목적은 이룬 것이다.
      if (cause instanceof ApiError && cause.detail.code === ErrorCode.NOT_IN_ROOM) onLobby();
      else setError(`나가지 못했습니다 · ${errorMessage(cause)}`);
    } finally {
      setLeaving(false);
      setConfirmLeave(false);
    }
  }

  async function backToWaitingRoom() {
    if (returning) return;
    setReturning(true);
    // 성공하면 서버가 이 소켓에 game:state null을 보내고, 위 효과가 대기실로 옮긴다.
    const failure = await sendGameIntent(GameClientEvent.RETURN, {});
    setReturning(false);
    if (failure) setError(failure);
  }

  const actions: GameActions = {
    onPlayCard: () => void playCard(),
    onRingBell: ringBell,
    // 플레이 중에 나가면 이탈(패배)이라 확인을 받고, 관전 중이면 바로 나간다(003-06).
    onLeave: () => (canAct ? setConfirmLeave(true) : void leaveRoom()),
    onSendChat: (text) => sendChat('message', text),
    onSendEmote: (emoji) => sendChat('emoji', emoji),
    onPickSkill: pickSkill,
    onUseSkill: useSkillSlot,
    onPickTarget: pickTarget,
  };

  const ended = snapshot?.status === GameStatus.ENDED;
  // 선택 창이 뜨거나 게임이 끝나면 대상 지정을 취소하고, Esc로도 취소한다.
  const targetingActive = targetingSlot !== null;
  useEffect(() => {
    if (!targetingActive) return;
    if (picking || !live) {
      setTargetingSlot(null);
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTargetingSlot(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [targetingActive, picking, live]);

  useGameShortcuts({
    skill: confirmLeave || ended ? undefined : useSkillSlot,
    j:
      confirmLeave || ended || judging || picking
        ? undefined
        : myTurn
          ? actions.onPlayCard
          : !canAct && !leaving
            ? actions.onLeave
            : undefined,
    // 종 옮기기 중에는 Space 대신 새 키로만 종을 친다.
    space: canAct && !confirmLeave && !judging && !picking && !bellMoved ? ringBell : undefined,
    bell:
      canAct && !confirmLeave && !judging && !picking && bellMoved
        ? { code: `Key${bellMoved.key}`, run: ringBell }
        : undefined,
  });

  if (!snapshot)
    return (
      <GameFrame>
        <div className="game-loading" role="status">
          <span className="loader" />
          게임 상태를 불러오는 중입니다.
        </div>
      </GameFrame>
    );

  if (ended)
    return (
      <GameFrame>
        <GameResult
          ranking={toRanking(snapshot, room, user.id)}
          notice={error || (snapshot.settled ? undefined : '결과를 저장하는 중이에요…')}
          busy={returning || leaving}
          onLobby={() => void leaveRoom()}
          onWaitingRoom={() => void backToWaitingRoom()}
        />
      </GameFrame>
    );

  const view = toGameView({
    snapshot,
    userId: user.id,
    nickname: user.nickname,
    room,
    log,
    emojis,
    skills,
    skillCast,
    targetingSlot,
    bell: judging ? lastBell : null,
    lastCards,
    offlineSince,
    serverNow: now + clockOffset,
    now,
    error,
  });
  return (
    <GameFrame>
      <GameBoard view={view} actions={actions} leaving={leaving} playing={playing} strike={strike}>
        {confirmLeave && (
          <LeaveConfirm
            leaving={leaving}
            onCancel={cancelLeave}
            onConfirm={() => void leaveRoom()}
          />
        )}
      </GameBoard>
    </GameFrame>
  );
}

function LeaveConfirm({
  leaving,
  onCancel,
  onConfirm,
}: {
  leaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onCancel]);
  return (
    <div
      className="game-confirm-dim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="game-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-title"
      >
        <h2 id="leave-title">게임을 나갈까요?</h2>
        <p>
          지금 나가면 이탈로 처리돼 패배로 기록되고, 남은 카드는 종 아래 보관 스택으로 옮겨져요.
          나간 뒤에는 이번 게임에 돌아올 수 없어요.
        </p>
        <div className="game-confirm-actions">
          <button type="button" className="button outline" onClick={onCancel}>
            계속하기
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="button danger"
            disabled={leaving}
            onClick={onConfirm}
          >
            {leaving ? '나가는 중…' : '나가기'}
          </button>
        </div>
      </div>
    </div>
  );
}
