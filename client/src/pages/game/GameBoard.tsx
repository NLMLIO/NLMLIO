import type { CSSProperties } from 'react';
import tableImage from '../../assets/game/table.png';
import { ActionBar } from './ActionBar';
import { Bell } from './Bell';
import { EmptyCardSlot, FruitCard } from './FruitCard';
import { GameChat } from './GameChat';
import { seatPlacements, type GameView } from './game-view';
import { PlayerSeat } from './PlayerSeat';
import { VerdictOverlay } from './VerdictOverlay';

export interface GameActions {
  onPlayCard: () => void;
  onRingBell: () => void;
  onLeave: () => void;
  onSendChat: (text: string) => void;
  onSendEmote: (emote: string) => void;
}

/** 게임 화면(06·15·18·19·05B·07A·07B·16): 테이블·자리·종·내 상태 바와 채팅 패널 */
export function GameBoard({
  view,
  actions,
  leaving = false,
}: {
  view: GameView;
  actions: GameActions;
  /** 방 나가기 요청을 보내는 중이면 나가기 버튼을 잠근다 */
  leaving?: boolean;
}) {
  const placements = seatPlacements(view.players.length);
  const [me, ...others] = view.players;
  const spectating = view.myPhase === 'spectating';
  return (
    <div className="game-screen">
      <main className="game-board">
        <header className="game-board-header">
          <div>
            <h1>{view.roomName}</h1>
            <p>진행 방향 ↻ 시계 방향</p>
          </div>
          <button type="button" className="game-chip" disabled={leaving} onClick={actions.onLeave}>
            나가기
          </button>
        </header>
        <img className="game-table" src={tableImage} width={600} height={530} alt="" />
        {view.players.map((player, index) => {
          const { card, rotation, shadow } = placements[index];
          return (
            <div
              key={player.id}
              className="table-card"
              style={
                {
                  left: card.x,
                  top: card.y,
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  '--shadow-x': shadow.x,
                  '--shadow-y': shadow.y,
                } as CSSProperties
              }
            >
              {player.topCard ? <FruitCard card={player.topCard} /> : <EmptyCardSlot />}
            </div>
          );
        })}
        <Bell
          state={view.bell}
          pileCount={view.pileCount}
          disabled={spectating || view.bell.kind === 'countdown'}
          onRing={actions.onRingBell}
        />
        {others.map((player, index) => {
          const { seat, seatGrowsUp } = placements[index + 1];
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
          leaving={leaving}
          onPlayCard={actions.onPlayCard}
          onLeave={actions.onLeave}
        />
        {view.verdict && <VerdictOverlay verdict={view.verdict} />}
      </main>
      <GameChat log={view.log} onSendChat={actions.onSendChat} onSendEmote={actions.onSendEmote} />
    </div>
  );
}
