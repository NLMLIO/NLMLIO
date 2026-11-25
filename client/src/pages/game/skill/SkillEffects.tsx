import type { CSSProperties } from 'react';
import { SPIT_COVER_MS, SPIT_DRIP_MS, skillById, SkillId } from '@nlmlio/shared';
import { GRADE_STYLE } from './skill-view';
import type { TimeStopView } from '../game-view';

const hintStyle = (skillId: SkillId): CSSProperties =>
  ({ '--grade': GRADE_STYLE[skillById(skillId).grade].color }) as CSSProperties;

/** 시간 정지(FUNC-009-05): 화면 전체가 청회색이 되고, 시작 연출이 끝나면 5초 카운트가 뜬다. 쓴 사람만 움직일 수 있다 */
export function SkillTimeStop({ stop }: { stop: TimeStopView }) {
  return (
    <div
      className={`time-stop${stop.byMe ? ' is-mine' : ''}`}
      role="status"
      aria-label={`시간 정지 ${stop.seconds}초`}
    >
      <p className="time-stop-count">{stop.seconds}</p>
      <p className="time-stop-label">시간 정지!</p>
      <p className="time-stop-sub">
        {stop.byMe ? '지금은 나만 카드를 낼 수 있어요' : `${stop.caster} 님만 움직일 수 있어요`}
      </p>
    </div>
  );
}

/**
 * 침 뱉기를 맞은 사람의 화면(FUNC-009-05): 침이 3초 동안 화면을 가렸다가 3초 동안 흘러내린다.
 * 조작은 막지 않고(pointer-events 없음) 판정·카드에는 영향이 없다.
 */
export function SkillSpit() {
  return (
    <>
      <div
        className="spit"
        aria-hidden="true"
        style={
          {
            '--spit-cover': `${SPIT_COVER_MS}ms`,
            '--spit-drip': `${SPIT_DRIP_MS}ms`,
          } as CSSProperties
        }
      >
        {SPIT_BLOBS.map((blob, index) => (
          <span
            key={index}
            className="spit-blob"
            style={{ left: blob.x, top: blob.y, width: blob.w, height: blob.h }}
          >
            <i className="spit-shine" />
          </span>
        ))}
        {SPIT_DRIPS.map((drip, index) => (
          <span
            key={index}
            className="spit-drip"
            style={{ left: drip.x, top: drip.y, height: drip.h, animationDelay: drip.delay }}
          />
        ))}
      </div>
      <p className="skill-hint spit-hint" style={hintStyle(SkillId.SPIT)} role="status">
        <b>으악!</b>
        <span>3초 동안 가려지고, 3초 동안 흘러내려요</span>
      </p>
    </>
  );
}

/** 아마테라스에 걸린 내 화면: 다음 종 판정까지 카드도 종도 못 한다 */
export function SkillBurnedHint() {
  return (
    <p className="skill-hint burned-hint" style={hintStyle(SkillId.AMATERASU)} role="status">
      <b>아마테라스</b>
      <span>다음 판정까지 카드도 종도 못 쳐요</span>
    </p>
  );
}

/** 침 덩어리: 보드(1100×900) 안의 자리와 크기. 시안 24의 배치를 따른다 */
const SPIT_BLOBS = [
  { x: 300, y: 225, w: 380, h: 300 },
  { x: 640, y: 177, w: 190, h: 150 },
  { x: 560, y: 335, w: 330, h: 260 },
  { x: 180, y: 417, w: 240, h: 190 },
  { x: 420, y: 505, w: 260, h: 190 },
  { x: 760, y: 457, w: 160, h: 130 },
];
const SPIT_DRIPS = [
  { x: 250, y: 575, h: 120, delay: '0ms' },
  { x: 360, y: 545, h: 90, delay: '150ms' },
  { x: 470, y: 505, h: 200, delay: '60ms' },
  { x: 610, y: 580, h: 130, delay: '240ms' },
  { x: 700, y: 560, h: 105, delay: '90ms' },
  { x: 820, y: 560, h: 145, delay: '180ms' },
];
