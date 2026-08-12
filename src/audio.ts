/**
 * 音訊引擎。
 *
 * 一次 render 出 AudioBuffer，每次敲擊開一個新的 AudioBufferSourceNode，
 * 所以連續快敲時聲音會自然疊加——這是 <audio> element 做不到的事。
 * 疊加會破音，所以整條匯流排掛一個 compressor，並限制同時發聲數。
 */

export type Voice = 'muyu' | 'bead';

/** 同時發聲上限。超過就停掉最舊的，避免疊加成一團糊音。 */
const VOICE_LIMIT = 8;

interface Timbre {
  seconds: number;
  f0: number;
  /** 木頭的泛音不是整數倍，所以用一組非諧和的分音 */
  partials: { ratio: number; gain: number; decay: number }[];
  /** 木槌或指甲接觸的瞬間，一段極短的噪音 */
  clickGain: number;
  clickDecay: number;
  /** 敲下去音高會微微下墜，這是木頭的特徵 */
  bend: number;
  bendDecay: number;
}

const TIMBRE: Record<Voice, Timbre> = {
  // 中空木腔，低沉、有餘韻
  muyu: {
    seconds: 0.42,
    f0: 486,
    partials: [
      { ratio: 1, gain: 1, decay: 26 },
      { ratio: 1.62, gain: 0.42, decay: 40 },
      { ratio: 2.71, gain: 0.18, decay: 62 },
      { ratio: 4.13, gain: 0.08, decay: 95 },
    ],
    clickGain: 0.55,
    clickDecay: 1400,
    bend: 0.09,
    bendDecay: 220,
  },
  // 兩顆珠子相碰，實心、乾、短
  bead: {
    seconds: 0.16,
    f0: 1180,
    partials: [
      { ratio: 1, gain: 1, decay: 88 },
      { ratio: 1.74, gain: 0.45, decay: 130 },
      { ratio: 2.83, gain: 0.2, decay: 190 },
    ],
    clickGain: 0.7,
    clickDecay: 2600,
    bend: 0.06,
    bendDecay: 400,
  },
};

let ctx: AudioContext | null = null;
let bus: DynamicsCompressorNode | null = null;
const buffers = new Map<Voice, AudioBuffer>();
const voices: AudioBufferSourceNode[] = [];

interface AudioSessionCapable {
  audioSession?: { type: string };
}

function ensureContext(): AudioContext {
  if (ctx) return ctx;

  ctx = new AudioContext({ latencyHint: 'interactive' });

  // iOS 的實體靜音開關預設會讓 Web Audio 靜音（<audio> element 不會）。
  // 使用者靜音狀態下開啟，敲了半天沒聲音，只會判定 App 壞掉。
  // Safari 16.4+ 可以宣告 playback 來繞過——需實機驗證。
  const session = (navigator as Navigator & AudioSessionCapable).audioSession;
  if (session) {
    try {
      session.type = 'playback';
    } catch {
      // 舊版或不支援：維持預設行為
    }
  }

  bus = ctx.createDynamicsCompressor();
  bus.threshold.value = -18;
  bus.knee.value = 12;
  bus.ratio.value = 8;
  bus.attack.value = 0.002;
  bus.release.value = 0.12;
  bus.connect(ctx.destination);

  for (const voice of Object.keys(TIMBRE) as Voice[]) {
    buffers.set(voice, render(ctx, TIMBRE[voice]));
  }

  // iOS 上來電、Siri、其他 App 佔用音訊後，AudioContext 會進入
  // Safari 專有的 interrupted 狀態，而且不會自動恢復。
  ctx.addEventListener('statechange', () => {
    if (ctx && ctx.state !== 'running') void ctx.resume();
  });

  return ctx;
}

/** 敲一下。可以連續呼叫，聲音會疊加。 */
export function strike(voice: Voice = 'muyu'): void {
  const c = ensureContext();

  // 每次都無條件檢查，而不是只在首次解鎖時做一次。
  // 這同時處理了「還沒被 user gesture 解鎖」與「被系統打斷後沒恢復」兩種狀況，
  // 成本只有一次字串比較。
  if (c.state !== 'running') void c.resume();

  const buffer = buffers.get(voice);
  if (!buffer || !bus) return;

  while (voices.length >= VOICE_LIMIT) {
    voices.shift()?.stop();
  }

  const src = c.createBufferSource();
  src.buffer = buffer;
  // 每一下略有差異，連續敲起來才不像取樣機
  src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.05;
  src.connect(bus);
  src.onended = () => {
    const i = voices.indexOf(src);
    if (i !== -1) voices.splice(i, 1);
  };
  src.start();
  voices.push(src);
}

/**
 * 合成一記敲擊。
 *
 * 想換成真實錄音的話，把這個函式換成 fetch + decodeAudioData 即可，
 * 下游完全不用動。
 */
function render(target: BaseAudioContext, t: Timbre): AudioBuffer {
  const sr = target.sampleRate;
  const length = Math.ceil(sr * t.seconds);
  const buf = target.createBuffer(1, length, sr);
  const out = buf.getChannelData(0);
  const phase = new Float64Array(t.partials.length);

  let peak = 0;
  for (let i = 0; i < length; i++) {
    const time = i / sr;
    const bend = 1 + t.bend * Math.exp(-time * t.bendDecay);

    let body = 0;
    for (let k = 0; k < t.partials.length; k++) {
      const p = t.partials[k];
      phase[k] += (2 * Math.PI * t.f0 * p.ratio * bend) / sr;
      body += Math.sin(phase[k]) * p.gain * Math.exp(-time * p.decay);
    }

    const click =
      (Math.random() * 2 - 1) * Math.exp(-time * t.clickDecay) * t.clickGain;
    const s = click + body * 0.6;
    out[i] = s;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
  }

  if (peak > 0) {
    const norm = 0.9 / peak;
    for (let i = 0; i < length; i++) out[i] *= norm;
  }

  return buf;
}
