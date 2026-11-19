import type { CSSProperties, ReactNode } from 'react';
import type { BellHandsView, ChatEmojiCode } from '@nlmlio/shared';
import { setMuted, useMuted } from '../../audio/sounds';
import tableImage from '../../assets/game/table.png';
import { ActionBar } from './ActionBar';
import { Bell } from './Bell';
import { EmptyCardSlot, FruitCard } from './FruitCard';
import { GameChat } from './GameChat';
import { seatPlacements, type GameView } from './game-view';
import { PlayerSeat, playerColorStyle } from './PlayerSeat';
import { SkillPick } from './skill/SkillPick';
import { SkillCast, SkillTargetHint } from './skill/SkillCast';
import {
  SkillBurnedHint,
  SkillRat,
  SkillShot,
  SkillSpit,
  SkillTimeStop,
} from './skill/SkillEffects';
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
  /** 보드 위에 띄우는 확인 창 등 */
  children?: ReactNode;
}) {
  const seatedPlayers = view.selfSeated === false ? view.players.slice(1) : view.players;
  const placements = seatPlacements(seatedPlayers.length, view.selfSeated === false);
  const [me, ...others] = view.players;
  const spectating = view.myPhase === 'spectating';
  const muted = useMuted();
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
            (!canJoinHandWindow &&
              (spectating || view.myPhase === 'judging' || view.bell.kind === 'countdown')) ||
            !!view.skills?.pick ||
            !!view.bellMove?.locked ||
            !!view.bellBreak ||
            !!view.smashed ||
            !!view.frozen
          }
          onRing={actions.onRingBell}
          moved={view.bellMove}
          broken={view.bellBreak}
          hackKey={view.hackKey}
          shell={view.shell}
        />
        {view.bellMove && <span className="bell-ghost" aria-hidden="true" />}
        {view.smashed && (
          <p className="skill-hint smashed-hint" role="status">
            <b>손이 부서졌어요</b>
            <span>다음 종 판정까지 종을 칠 수 없어요</span>
          </p>
        )}
        {view.mine && (
          <span className="skill-mine" role="img" aria-label="지뢰가 깔려 있어요">
            ✸
          </span>
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
              <div className="player-hand">
                <svg viewBox="0 0 100 140" focusable="false">
                  <path d="M30 117v-12c-7-6-15-16-20-26l-5-11c-2-5 1-9 5-9 3-1 6 1 9 5l8 10V29c0-5 3-8 7-8s7 3 7 8v32-45c0-5 3-8 7-8s7 3 7 8v45-40c0-5 3-8 7-8s7 3 7 8v43-29c0-5 3-8 7-8s7 3 7 8v44c0 13-3 22-11 30v8Z" />
                  <path className="hand-crease" d="M28 76c7-1 14 3 17 10M42 70v8m14-10v9m14-8v9" />
                  <path className="hand-cuff" d="M27 113h48v22H27z" />
                </svg>
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
          phase={view.myPhase}
          turnNickname={view.turnNickname}
          turnSeconds={view.myTurnSeconds}
          emote={me.emote}
          emoteKey={me.emoteKey}
          playing={playing}
          leaving={leaving}
          bellKey={view.hackKey ?? view.bellMove?.key}
          onPlayCard={actions.onPlayCard}
          onLeave={actions.onLeave}
        />
        {view.skills && (
          <SkillDock
            slots={view.skills.slots}
            armed={view.targeting?.slot ?? null}
            onUse={actions.onUseSkill}
          />
        )}
        {view.skillCast && <SkillCast cast={view.skillCast} />}
        {view.skillCast?.skillId === SkillId.RAT && seatPoint(view.skillCast.casterId) && (
          <SkillRat
            key={view.skillCast.key}
            from={{ x: 550, y: 440 }}
            to={seatPoint(view.skillCast.casterId)!}
          />
        )}
        {view.skillCast?.skillId === SkillId.RUSSIAN_ROULETTE &&
          view.skillCast.targetId &&
          seatPoint(view.skillCast.targetId) && (
            <SkillShot key={view.skillCast.key} at={seatPoint(view.skillCast.targetId)!} />
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
          key={view.skills.pick.successCount}
          pick={view.skills.pick}
          slots={view.skills.slots}
          onChoose={(choice) => actions.onPickSkill?.(choice)}
        />
      )}
    </div>
  );
}
