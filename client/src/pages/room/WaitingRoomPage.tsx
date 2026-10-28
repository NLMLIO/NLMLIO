import { useEffect, useRef, useState } from 'react';
import {
  RoomClientEvent,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  MIN_PLAYERS,
  RoomRole,
  RoomStatus,
} from '@nlmlio/shared';
import type { RoomMember, RoomResponse } from '@nlmlio/shared';
import { api, errorMessage } from '../../api/http';
import { sendIntent } from '../../socket/socket';
import { useRoomStore } from '../../stores/room-store';
import { colorOf } from './member-color';
import { RoomChat } from './RoomChat';

const pad = (value: number) => String(value).padStart(2, '0');

type Confirm = { kind: 'kick' | 'delegate'; member: RoomMember };

/** 대기실(FUNC-003·004·005-01): 참가자·관전자 칸, 방장 메뉴, 채팅. 화면은 서버가 보낸 방 상태만 그린다. */
export function WaitingRoomPage({ userId, onLeft }: { userId: number; onLeft: () => void }) {
  const room = useRoomStore((state) => state.room);
  const synced = useRoomStore((state) => state.synced);
  const connected = useRoomStore((state) => state.connected);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (menuFor === null) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setMenuFor(null);
      } else if (!(event.target as Element).closest('.host-menu-anchor')) setMenuFor(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menuFor]);

  if (!synced)
    return (
      <main className="page-state" role="status">
        <span className="loader" />
        {connected ? '대기실 정보를 불러오는 중입니다.' : '서버에 연결하는 중입니다.'}
      </main>
    );
  if (!room)
    return (
      <main className="page-state">
        <p>참가 중인 방이 없습니다.</p>
        <button className="button outline" onClick={onLeft}>
          로비로 가기
        </button>
      </main>
    );

  const current = room;
  const me = current.members.find((member) => member.userId === userId);
  const isHost = current.hostId === userId;
  const waiting = current.status === RoomStatus.WAITING;
  const players = current.members.filter((member) => member.role === RoomRole.PLAYER);
  const spectators = current.members.filter((member) => member.role === RoomRole.SPECTATOR);
  const host = current.members.find((member) => member.userId === current.hostId);
  const emptySlots = MAX_PLAYERS - players.length;
  const startBlocked = players.length < MIN_PLAYERS;

  async function run(action: Promise<string | null>) {
    setMenuFor(null);
    setError((await action) ?? '');
  }
  const move = (target: number, role: RoomRole) =>
    run(sendIntent(RoomClientEvent.MOVE, { userId: target, role }));
  function ask(kind: Confirm['kind'], member: RoomMember) {
    setMenuFor(null);
    setConfirm({ kind, member });
  }
  async function confirmAction() {
    if (!confirm) return;
    const { kind, member } = confirm;
    setConfirm(null);
    await run(
      sendIntent(kind === 'kick' ? RoomClientEvent.KICK : RoomClientEvent.DELEGATE, {
        userId: member.userId,
      }),
    );
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사하지 못했어요. 코드를 직접 선택해 복사해주세요.');
    }
  }
  async function leave() {
    try {
      await api<void>('/rooms/me/leave', { method: 'POST' });
      onLeft();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function hostMenu(member: RoomMember) {
    if (!isHost || !waiting || member.userId === userId) return null;
    const open = menuFor === member.userId;
    const toPlayer = member.role === RoomRole.SPECTATOR;
    return (
      <span className="host-menu-anchor">
        <button
          className="more-button"
          aria-label={`${member.nickname} 방장 메뉴`}
          aria-expanded={open}
          data-active={open || undefined}
          onClick={() => setMenuFor(open ? null : member.userId)}
        >
          ···
        </button>
        {open && (
          <div className="host-menu" role="menu">
            <button
              role="menuitem"
              disabled={toPlayer ? emptySlots === 0 : spectators.length >= MAX_SPECTATORS}
              onClick={() =>
                void move(member.userId, toPlayer ? RoomRole.PLAYER : RoomRole.SPECTATOR)
              }
            >
              {toPlayer ? '참가자로 이동' : '관전자로 이동'}
            </button>
            <button role="menuitem" onClick={() => ask('delegate', member)}>
              방장 위임
            </button>
            <hr />
            <button role="menuitem" className="danger" onClick={() => ask('kick', member)}>
              추방
            </button>
          </div>
        )}
      </span>
    );
  }

  return (
    <div className="waiting-room">
      <main className="waiting-main">
        <header className="waiting-header">
          <div>
            <p className="mono-label">{waiting ? 'WAITING' : 'PLAYING'}</p>
            <h1>{current.name}</h1>
          </div>
          <div className="room-code-box">
            <div>
              <span className="mono-label">ROOM CODE</span>
              <strong>{current.code}</strong>
            </div>
            <button onClick={() => void copyCode()}>{copied ? '복사됨' : '복사'}</button>
          </div>
        </header>

        {!waiting && (
          <p className="room-banner" role="status">
            게임이 시작됐어요. 게임 화면은 아직 준비 중이에요.
          </p>
        )}

        <section className="room-section" aria-labelledby="players-title">
          <div className="room-section-header">
            <h2 id="players-title">
              플레이어{' '}
              <span className="count lime">
                {pad(players.length)}/{pad(MAX_PLAYERS)}
              </span>
            </h2>
            <span className="room-hint">
              최대 {MAX_PLAYERS}명 · {MIN_PLAYERS}명 이상이면 시작할 수 있어요
            </span>
          </div>
          <ol className="player-slots">
            {players.map((member, index) => {
              const mine = member.userId === userId;
              const tag = [member.userId === current.hostId && 'HOST', mine && 'YOU']
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={member.userId} className="player-card" data-me={mine || undefined}>
                  <div className="player-card-top">
                    <span className="mono-label">P{index + 1}</span>
                    {tag && <span className="mono-label lime">{tag}</span>}
                    {hostMenu(member)}
                  </div>
                  <Avatar room={current} member={member} size={84} />
                  <p className="player-name">{member.nickname}</p>
                </li>
              );
            })}
            {Array.from({ length: emptySlots }, (_, index) => {
              const canJoin = waiting && me?.role === RoomRole.SPECTATOR && index === 0;
              return (
                <li
                  key={`empty-${index}`}
                  className="player-card empty"
                  data-joinable={canJoin || undefined}
                >
                  <div className="player-card-top">
                    <span className="mono-label">P{players.length + index + 1}</span>
                  </div>
                  <span className="empty-avatar" aria-hidden="true" />
                  <p>{canJoin ? '빈 자리' : '참가 대기 중'}</p>
                  {canJoin && (
                    <button
                      className="small-button lime"
                      onClick={() => void move(userId, RoomRole.PLAYER)}
                    >
                      여기로 참가
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="room-section" aria-labelledby="spectators-title">
          <div className="room-section-header">
            <h2 id="spectators-title">
              관전자 <span className="count">{pad(spectators.length)}</span>
            </h2>
            <div className="room-section-actions">
              <span className="room-hint">관전자는 게임에 참여하지 않고 채팅만 할 수 있어요</span>
              {me?.role === RoomRole.SPECTATOR ? (
                <button
                  className="small-button lime"
                  disabled={!waiting || emptySlots === 0}
                  onClick={() => void move(userId, RoomRole.PLAYER)}
                >
                  참가자로 이동
                </button>
              ) : (
                <button
                  className="small-button"
                  disabled={!waiting || spectators.length >= MAX_SPECTATORS}
                  onClick={() => void move(userId, RoomRole.SPECTATOR)}
                >
                  관전석으로 이동
                </button>
              )}
            </div>
          </div>
          <ul className="spectator-list">
            {spectators.map((member) => (
              <li
                key={member.userId}
                className="spectator-chip"
                data-me={member.userId === userId || undefined}
              >
                <Avatar room={current} member={member} size={28} />
                <span className="spectator-name">{member.nickname}</span>
                {member.userId === current.hostId && <span className="mono-label lime">HOST</span>}
                {member.userId === userId && <span className="mono-label lime">YOU</span>}
                {hostMenu(member)}
              </li>
            ))}
            {spectators.length === 0 && <li className="room-hint faint">아직 관전자가 없어요</li>}
          </ul>
        </section>

        {error && (
          <p className="feedback error room-error" role="alert">
            {error}
          </p>
        )}

        <footer className="waiting-footer">
          <button className="button outline" onClick={() => void leave()}>
            나가기
          </button>
          <div className="waiting-footer-start">
            {!waiting ? (
              <span>게임 중이에요</span>
            ) : isHost ? (
              <span>
                {startBlocked
                  ? `참가자 ${MIN_PLAYERS}명 이상이면 시작할 수 있어요`
                  : `참가자 ${players.length}명으로 시작해요`}
              </span>
            ) : (
              <span>
                <span className="waiting-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                방장 <strong>{host?.nickname}</strong>님이 시작하기를 기다리는 중
              </span>
            )}
            <button
              className="button primary start-button"
              disabled={!isHost || !waiting || startBlocked}
              onClick={() => void run(sendIntent(RoomClientEvent.START, {}))}
            >
              게임 시작
            </button>
          </div>
        </footer>
      </main>

      <RoomChat />

      {confirm && (
        <ConfirmModal
          title={
            confirm.kind === 'kick'
              ? `${confirm.member.nickname}님을 추방할까요?`
              : `${confirm.member.nickname}님에게 방장을 넘길까요?`
          }
          body={
            confirm.kind === 'kick'
              ? `추방하면 ${confirm.member.nickname}님은 바로 로비로 이동해요.`
              : `넘기고 나면 게임 시작, 관전자 이동, 추방은 ${confirm.member.nickname}님만 할 수 있어요.`
          }
          confirmLabel={confirm.kind === 'kick' ? '추방하기' : '넘기기'}
          danger={confirm.kind === 'kick'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
    </div>
  );
}

function Avatar({ room, member, size }: { room: RoomResponse; member: RoomMember; size: number }) {
  return (
    <span
      className="member-avatar"
      style={{ width: size, height: size, background: colorOf(room, member.userId) }}
      aria-hidden="true"
    />
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
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
      className="modal-dim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="confirm-actions">
          <button className="button outline" onClick={onCancel}>
            취소
          </button>
          <button
            ref={confirmRef}
            className={`button ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
