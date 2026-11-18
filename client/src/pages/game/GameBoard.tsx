import type { CSSProperties, ReactNode } from 'react';
import type { ChatEmojiCode } from '@nlmlio/shared';
import { setMuted, useMuted } from '../../audio/sounds';
import tableImage from '../../assets/game/table.png';
import { ActionBar } from './ActionBar';
import { Bell } from './Bell';
import { EmptyCardSlot, FruitCard } from './FruitCard';
import { GameChat } from './GameChat';
import { seatPlacements, type GameView } from './game-view';
import { PlayerSeat, playerColorStyle } from './PlayerSeat';
import { VerdictOverlay } from './VerdictOverlay';

export interface GameActions {
  onPlayCard: () => void;
  onRingBell: () => void;
  onLeave: () => void;
  onSendChat: (text: string) => Promise<string | null> | void;
  onSendEmote: (emote: ChatEmojiCode) => Promise<string | null> | void;
}

/** 게임 화면(06·15·18·19·05B·07A·07B·16): 테이블·자리·종·내 상태 바와 채팅 패널 */
export function GameBoard({
  view,
  actions,
  leaving = false,
  playing = false,
  strike,
  children,
}: {
  view: GameView;
  actions: GameActions;
  /** 방 나가기 요청을 보내는 중이면 나가기 버튼을 잠근다 */
  leaving?: boolean;
  /** 카드 내기 요청을 보내는 중이면 카드 내기 버튼을 잠근다 */
  playing?: boolean;
  strike?: { id: number; playerId: string };
  /** 보드 위에 띄우는 확인 창 등 */
  children?: ReactNode;
}) {
  const seatedPlayers = view.selfSeated === false ? view.players.slice(1) : view.players;
  const placements = seatPlacements(seatedPlayers.length, view.selfSeated === false);
  const [me, ...others] = view.players;
  const spectating = view.myPhase === 'spectating';
  const muted = useMuted();
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
          disabled={spectating || view.myPhase === 'judging' || view.bell.kind === 'countdown'}
          onRing={actions.onRingBell}
        />
        {seatedPlayers.map((player, index) => (
          <div
            key={`${player.id}:${strike?.playerId === player.id ? strike.id : 'rest'}`}
            className={`player-hand-track${strike?.playerId === player.id ? ' is-striking' : ''}`}
            style={
              {
                left: 550,
                top: 440,
                '--hand-angle': `${placements[index].rotation}deg`,
                ...playerColorStyle(player.color),
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <svg className="player-hand" viewBox="0 0 80 110">
              <path d="M22 104V81C13 74 7 62 9 57c2-5 7-4 11 0l5 6V20c0-8 11-8 11 0v29-37c0-8 11-8 11 0v37-30c0-8 11-8 11 0v33-21c0-8 11-8 11 0v35c0 12-5 20-10 27v11Z" />
              <path className="hand-cuff" d="M20 94h42v14H20z" />
            </svg>
          </div>
        ))}
        {others.map((player, index) => {
          const { seat, seatGrowsUp } = placements[index + (view.selfSeated === false ? 0 : 1)];
          return (
            <PlayerSeat
              key={player.id}
              player={player}
              growsUp={seatGrowsUp}
              style={{ left: seat.x, top: seat.y }}
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
          onPlayCard={actions.onPlayCard}
          onLeave={actions.onLeave}
        />
        {view.verdict && <VerdictOverlay verdict={view.verdict} />}
        {children}
      </main>
      <GameChat log={view.log} onSendChat={actions.onSendChat} onSendEmote={actions.onSendEmote} />
    </div>
  );
}
