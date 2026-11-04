// 게임 효과음(FUNC-005-14)을 코드로 합성해 client/public/sounds/*.wav로 쓴다.
// 외부 리소스를 쓰지 않는 직접 제작물이다. 다시 만들려면: node client/scripts/generate-sounds.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/sounds');

/** 시드가 고정된 난수(파일이 매번 같게 나오도록) */
let seed = 7;
const noise = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed / 0x7fffffff) * 2 - 1;
};

function render(seconds, sample) {
  const data = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < data.length; i++) data[i] = sample(i / RATE);
  return data;
}

function wav(name, data, gain = 0.8) {
  const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  const buffer = Buffer.alloc(44 + data.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + data.length * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(data.length * 2, 40);
  data.forEach((value, i) =>
    buffer.writeInt16LE(Math.round((value / peak) * gain * 32767), 44 + i * 2),
  );
  writeFileSync(join(out, name), buffer);
}

const sine = (freq, t) => Math.sin(2 * Math.PI * freq * t);
/** 짧은 어택 뒤 지수 감쇠 */
const envelope = (t, decay, attack = 0.004) =>
  t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/** 여러 음을 차례로 이어 붙인다 */
const sequence = (notes, length, voice) => (t) =>
  notes.reduce((sum, freq, index) => {
    const local = t - index * length;
    return local < 0 ? sum : sum + voice(freq, local);
  }, 0);

// 종: 금속성 배음(비정수배)이 섞인 짧은 '띵'
wav(
  'bell.wav',
  render(0.9, (t) =>
    [
      [1760, 1, 0.35],
      [1760 * 2.76, 0.45, 0.18],
      [1760 * 5.4, 0.25, 0.08],
      [1760 * 0.5, 0.2, 0.5],
    ].reduce((sum, [freq, amp, decay]) => sum + amp * sine(freq, t) * envelope(t, decay, 0.001), 0),
  ),
);

// 카드 뒤집기: 높은 대역 잡음을 아주 짧게 두 번
wav(
  'card.wav',
  render(0.12, (t) => {
    const flick = (start) => (t < start ? 0 : noise() * envelope(t - start, 0.012, 0.001));
    return flick(0) + 0.6 * flick(0.045) + 0.3 * sine(900, t) * envelope(t, 0.02);
  }),
  0.6,
);

// 종 성공: 올라가는 세 음
wav(
  'success.wav',
  render(
    0.6,
    sequence(
      [1046.5, 1318.5, 1568],
      0.09,
      (freq, t) => (sine(freq, t) + 0.3 * sine(freq * 2, t)) * envelope(t, 0.16),
    ),
  ),
);

// 오발: 낮게 떨리는 버저
wav(
  'misfire.wav',
  render(0.45, (t) => {
    const square = (freq) => Math.sign(sine(freq, t));
    return (0.5 * square(146) + 0.5 * square(151)) * (t < 0.36 ? 1 : Math.exp(-(t - 0.36) / 0.03));
  }),
  0.45,
);

// 게임 종료: 짧은 팡파르
wav(
  'end.wav',
  render(
    1.3,
    sequence(
      [523.25, 659.25, 783.99, 1046.5],
      0.14,
      (freq, t) =>
        (sine(freq, t) + 0.4 * sine(freq * 2, t) + 0.15 * sine(freq * 3, t)) * envelope(t, 0.3),
    ),
  ),
);
