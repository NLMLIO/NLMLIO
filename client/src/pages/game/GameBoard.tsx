import type { CSSProperties, ReactNode } from 'react';
import type { BellHandsView, ChatEmojiCode } from '@nlmlio/shared';
import { setMuted, useMuted } from '../../audio/sounds';
import tableImage from '../../assets/game/table.png';
import { SpectatorFullscreen } from './SpectatorFullscreen';
import { ActionBar } from './ActionBar';
import { Bell } from './Bell';
import { EmptyCardSlot, FruitCard } from './FruitCard';
import { GameChat } from './GameChat';
import { bellCenter, seatPlacements, type GameView } from './game-view';
import { PlayerSeat, playerColorStyle } from './PlayerSeat';
import { SkillShot } from './skill/SkillShot';
import { SkillPick } from './skill/SkillPick';
import { FistImpact, SkillMotion } from './skill/SkillMotion';
import { SkillRat } from './skill/SkillRat';
import { SkillCast, SkillTargetHint } from './skill/SkillCast';
import { SkillBurnedHint, SkillSpit, SkillTimeStop } from './skill/SkillEffects';
import { SkillId } from '@nlmlio/shared';
import { SkillDock } from './skill/SkillSlot';
import type { SkillPickHandler } from './skill/skill-view';
import { VerdictOverlay } from './VerdictOverlay';

export interface GameActions {
  onPlayCard: () => void;
  onRingBell: (bell?: number) => void;
  onLeave: () => void;
  onSendChat: (text: string) => Promise<string | null> | void;
  onSendEmote: (emote: ChatEmojiCode) => Promise<string | null> | void;
  /** 스킬 후보 선택(FUNC-009-03). 없으면 선택 창은 보기만 한다 */
  onPickSkill?: SkillPickHandler;
  /** 슬롯의 스킬 사용(FUNC-009-04). 대상 지정 스킬이면 먼저 대상을 고르게 한다 */
  onUseSkill?: (slot: number) => void;
  /** 대상 지정 중 좌석을 눌러 대상으로 고른다 */
  onPickTarget?: (userId: number) => void;
}

/** 게임 화면(06·15·18·19·05B·07A·07B·16·21·22): 테이블·자리·종·내 상태 바와 채팅 패널 */
export function GameBoard({
  view,
  actions,
  leaving = false,
  playing = false,
  hands,
  canJoinHandWindow = false,
  armedSmashSlot = null,
  children,
}: {
  view: GameView;
  actions: GameActions;
  /** 방 나가기 요청을 보내는 중이면 나가기 버튼을 잠근다 */
  leaving?: boolean;
  /** 카드 내기 요청을 보내는 중이면 카드 내기 버튼을 잠근다 */
  playing?: boolean;
  hands?: Pick<BellHandsView, 'turnSeq' | 'userIds'>;
  canJoinHandWindow?: boolean;
  armedSmashSlot?: number | null;
  /** 보드 위에 띄우는 확인 창 등 */
  children?: ReactNode;
}) {
  const seatedPlayers = view.selfSeated === false ? view.players.slice(1) : view.players;
  const placements = seatPlacements(seatedPlayers.length, view.selfSeated === false);
  const [me, ...others] = view.players;
  const spectating = view.myPhase === 'spectating';
  const muted = useMuted();
  const casts = view.skillCasts ?? [];
  const bell = bellCenter(view.bellMove, !!view.shell && !view.bellBreak);
  /** 좌석 id로 그 자리의 중심(보드 좌표). 앉은 자리가 없으면 null */
  const seatPoint = (id: string) => {
    const index = seatedPlayers.findIndex((player) => player.id === id);
    if (index < 0) return null;
    const { seat } = placements[index];
    return { x: seat.x, y: seat.y - 40 };
  };
  return (
    <div className="game-screen">
      <main className="game-board">
        <header className="game-board-header">
          <div>
            <h1>{view.roomName}</h1>
            <p>진행 방향 ↻ 시계 방향</p>
          </div>
          {spectating && <SpectatorFullscreen />}
          <button
            type="button"
            className="game-chip sound-toggle"
            aria-pressed={muted}
            aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
            onClick={() => setMuted(!muted)}
          >
            {muted ? '소리 끔' : '소리 켬'}
          </button>
          <button type="button" className="game-chip" disabled={leaving} onClick={actions.onLeave}>
            나가기
          </button>
        </header>
        {!!view.spectators?.length && (
          <div className="game-spectators" aria-label="관전자">
            <span>관전 {view.spectators.length}</span>
            {view.spectators.map((spectator) => (
              <span key={spectator.id} className="spectator-label">
                {spectator.nickname}
                {spectator.emote && (
                  <span key={spectator.emoteKey} className="player-emote">
                    {spectator.emote}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
        <img className="game-table" src={tableImage} width={600} height={530} alt="" />
        {seatedPlayers.map((player, index) => {
          const { card, rotation } = placements[index];
          return (
            <div
              key={player.id}
              className="table-card"
              data-stacked={(player.tableCount ?? 0) > 1 || undefined}
              style={
                {
                  left: card.x,
                  top: card.y,
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  '--stack-depth': Math.min(
                    2,
                    Math.max(0, (player.tableCount ?? (player.topCard ? 1 : 0)) - 1),
                  ),
                } as CSSProperties
              }
            >
              {player.topCard ? (
                <FruitCard key={player.cardKey} card={player.topCard} />
              ) : (
                <EmptyCardSlot />
              )}
              {player.topCard && (
                <span className="table-count" style={{ transform: `rotate(${-rotation}deg)` }}>
                  {player.tableCount ?? 1}장
                </span>
              )}
              {player.topCard && player.autoPlayed && <span className="auto-tag">자동</span>}
            </div>
          );
        })}
        <Bell
          state={view.bell}
          pileCount={view.pileCount}
          disabled={
            armedSmashSlot === null &&
            ((!canJoinHandWindow &&
              (spectating || view.myPhase === 'judging' || view.bell.kind === 'countdown')) ||
              !!view.skills?.pick ||
              !!view.bellMove?.locked ||
              !!view.bellBreak ||
              !!view.smashed ||
              !!view.frozen)
          }
          onRing={actions.onRingBell}
          moved={view.bellMove}
          broken={view.bellBreak}
          breakStrike={casts.find((cast) => cast.skillId === SkillId.BELL_BREAK)?.key}
          hackKey={view.hackKey}
          shell={view.shell}
        />
        {view.bellMove && !view.shell && <span className="bell-ghost" aria-hidden="true" />}
        {armedSmashSlot !== null && (
          <p className="smash-ready-hint" role="status">
            내려치기 준비 ·{' '}
            <kbd>{view.shell?.keys.join('·') ?? view.hackKey ?? view.bellMove?.key ?? 'SPACE'}</kbd>
          </p>
        )}
        {view.smashed && (
          <p className="skill-hint smashed-hint" role="status">
            <b>손이 부서졌어요</b>
            <span>다음 종 판정까지 종을 칠 수 없어요</span>
          </p>
        )}
        {seatedPlayers.map((player, index) => {
          const handIndex = hands?.userIds.indexOf(Number(player.id)) ?? -1;
          return (
            <div
              key={`${player.id}:${handIndex >= 0 ? hands?.turnSeq : 'rest'}`}
              className={`player-hand-track${handIndex >= 0 ? ' is-striking' : ''}`}
              style={
                {
                  left: 550,
                  top: 440,
                  '--hand-angle': `${placements[index].rotation}deg`,
                  '--hand-stack-index': Math.max(0, handIndex),
                  ...playerColorStyle(player.color),
                } as CSSProperties
              }
              aria-hidden="true"
            >
              <div className="player-hand" data-injured={player.smashed || undefined}>
                {casts
                  .filter(
                    (cast) => cast.skillId === SkillId.HAND_SMASH && cast.targetId === player.id,
                  )
                  .map((cast) => (
                    <FistImpact key={cast.key} />
                  ))}
                {armedSmashSlot !== null && player.id === me.id ? (
                  <svg className="muscle-hand" viewBox="0 0 112 144" focusable="false">
                    <path
                      className="hand-skin"
                      d="M24 132c-11-5-18-18-16-32 1-12 8-23 16-29-1-13 2-30 6-43l-2-11 6-9 8-1 4-4 9 2 6-1 9 7 6 13-3 12-9 6-13-2-2 25c10-6 24-6 35 1 14 8 22 25 17 39-5 16-20 28-39 31z"
                    />
                    <path
                      className="hand-shadow"
                      d="M15 108c15 14 29 11 41 2 14 7 33-2 42-14-1 15-14 30-33 33l-35-1z"
                    />
                    <path
                      className="hand-crease"
                      d="M30 94c4-13 12-21 22-23m2 9c11 6 23 3 28-4m-47-53 7 6 7-2m0-11 8 8 6-1m-8-13 8 7"
                    />
                    <path className="hand-cuff" d="m22 126 43 4-2 11-40-4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 112 144" focusable="false">
                    <path
                      className="hand-skin"
                      d="M34 119c0-7-3-11-8-17L8 78c-4-6-4-12 0-15 4-3 8-2 12 2l14 15-13-47c-2-7 0-12 5-13 5-2 9 1 11 7l10 33-6-46c-1-6 2-11 7-11 6-1 9 3 10 9l6 45 1-39c0-6 3-10 8-10s8 4 8 10l-1 44 6-26c2-6 5-8 10-7 5 2 6 6 5 11l-7 36c-1 8-1 16-4 24-2 7-7 13-8 20l-1 9-45-1z"
                    />
                    <path
                      className="hand-shadow"
                      d="M33 84c9 6 15 13 17 22-8-8-13-12-21-16zm54-13c0 18-2 30-11 42 4-15 5-31 11-42z"
                    />
                    <path
                      className="hand-crease"
                      d="M33 76c7 1 15 6 20 14m-3-27 2 7m13-11 1 8m13-4-1 7"
                    />
                    <path className="hand-cuff" d="m30 118 54 2-1 20-54-3z" />
                    <path className="hand-seam" d="m35 124 42 2" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
        {!!hands?.userIds.length && (
          <ul className="bell-hand-order" aria-label="서버 종 접수 순서">
            {hands.userIds.map((id) => (
              <li key={id}>{seatedPlayers.find((player) => Number(player.id) === id)?.nickname}</li>
            ))}
          </ul>
        )}
        {others.map((player, index) => {
          const { seat, seatGrowsUp } = placements[index + (view.selfSeated === false ? 0 : 1)];
          return (
            <PlayerSeat
              key={player.id}
              player={player}
              growsUp={seatGrowsUp}
              style={{ left: seat.x, top: seat.y }}
              onSelect={
                view.targeting?.targetIds.includes(player.id) && actions.onPickTarget
                  ? () => actions.onPickTarget?.(Number(player.id))
                  : undefined
              }
            />
          );
        })}
        {view.banner && (
          <p className={`game-banner ${view.banner.tone}`} role="status">
            {view.banner.messages.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </p>
        )}
        <ActionBar
          nickname={me.nickname}
          deckCount={me.deckCount}
          smashReady={armedSmashSlot !== null}
          receivedPenalty={me.outcome?.tone === 'receive'}
          phase={view.myPhase}
          turnNickname={view.turnNickname}
          turnSeconds={view.myTurnSeconds}
          emote={me.emote}
          emoteKey={me.emoteKey}
          playing={playing}
          leaving={leaving}
          bellKey={view.shell ? view.shell.keys.join('·') : (view.hackKey ?? view.bellMove?.key)}
          onPlayCard={actions.onPlayCard}
          onLeave={actions.onLeave}
        />
        {view.skills && (
          <SkillDock
            slots={view.skills.slots}
            armed={armedSmashSlot ?? view.targeting?.slot ?? null}
            onUse={actions.onUseSkill}
          />
        )}
        {casts.map((cast) => {
          const target = cast.targetId ? seatPoint(cast.targetId) : null;
          if (cast.skillId === SkillId.RUSSIAN_ROULETTE && cast.targetId && target)
            return (
              <SkillShot
                key={cast.key}
                center={bell}
                targetId={cast.targetId}
                targetName={cast.target ?? ''}
                at={target}
                movedCards={cast.movedCards}
              />
            );
          return (
            <SkillMotion
              key={cast.key}
              cast={cast}
              caster={seatPoint(cast.casterId)}
              target={target}
              reflector={cast.reflectedById ? seatPoint(cast.reflectedById) : null}
            />
          );
        })}
        {casts[0] && <SkillCast cast={casts[0]} />}
        {view.rat && (
          <SkillRat
            key={`${view.rat.phase}-${view.rat.key}`}
            rat={view.rat}
            bell={bell}
            seat={view.rat.recipientId ? seatPoint(view.rat.recipientId) : null}
          />
        )}
        {view.spit && <SkillSpit key={view.spit.key} />}
        {view.frozen === 'amaterasu' && <SkillBurnedHint />}
        {view.targeting && <SkillTargetHint targeting={view.targeting} />}
        {view.verdict && <VerdictOverlay verdict={view.verdict} />}
        {children}
      </main>
      <GameChat log={view.log} onSendChat={actions.onSendChat} onSendEmote={actions.onSendEmote} />
      {view.timeStop && <SkillTimeStop stop={view.timeStop} />}
      {view.skills?.pick && (
        <SkillPick
          key={view.skills.pick.pickNo}
          pick={view.skills.pick}
          slots={view.skills.slots}
          onChoose={(choice) => actions.onPickSkill?.(choice)}
        />
      )}
    </div>
  );
}
