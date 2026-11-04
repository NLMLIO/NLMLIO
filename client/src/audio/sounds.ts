import { Howl, Howler } from 'howler';
import { useSyncExternalStore } from 'react';

/**
 * 게임 효과음(FUNC-005-14). 앱 시작 시 미리 불러 두고, 첫 사용자 입력 때 오디오를 깨운다.
 * 파일을 못 불러오면 소리만 빠지고 게임은 그대로 진행된다.
 */
export type SoundName = 'bell' | 'card' | 'success' | 'misfire' | 'end';

const NAMES: SoundName[] = ['bell', 'card', 'success', 'misfire', 'end'];
const VOLUME: Record<SoundName, number> = {
  bell: 0.9,
  card: 0.6,
  success: 0.7,
  misfire: 0.6,
  end: 0.7,
};
const MUTE_KEY = 'nlmlio:muted';

let sounds: Partial<Record<SoundName, Howl>> = {};
let muted = readMuted();
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 효과음 파일을 미리 불러온다. 여러 번 불러도 한 번만 만든다. */
export function preloadSounds(): void {
  if (Object.keys(sounds).length) return;
  Howler.mute(muted);
  sounds = Object.fromEntries(
    NAMES.map((name) => [
      name,
      new Howl({
        src: [`/sounds/${name}.wav`],
        preload: true,
        volume: VOLUME[name],
        // 실패해도 다음 재생 때 다시 시도하지 않고 조용히 넘어간다.
        onloaderror: () => {
          delete sounds[name];
        },
      }),
    ]),
  );
  // 브라우저 자동재생 제한: 첫 클릭·키 입력에서 오디오 컨텍스트를 깨운다.
  const unlock = () => {
    void Howler.ctx?.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function playSound(name: SoundName): void {
  try {
    sounds[name]?.play();
  } catch {
    // 소리는 부가 기능이다. 실패해도 게임은 계속한다.
  }
}

export function setMuted(next: boolean): void {
  muted = next;
  Howler.mute(next);
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // 저장하지 못해도 이번 접속 동안은 유지된다.
  }
  listeners.forEach((listener) => listener());
}

/** 음소거 상태(클라이언트 설정, 서버에 보내지 않는다) */
export function useMuted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => muted,
  );
}
