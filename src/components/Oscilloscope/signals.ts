// Сигналы виртуального осциллографа: четыре канала одного переключения по физической модели.
//  CH1 — команда (напряжение на катушке), CH2 — ток катушки, CH3 — давление в пилотной камере,
//  CH4 — положение золотника. Шум датчиков детерминированный (сид), чтобы картинка не «дышала».

import {
  DEFAULT_PARAMS,
  SimPoint,
  SimResult,
  VALVE_CONST,
  crossingTime,
  simulate,
  simulateReturn,
} from '../../lib/valveModel';

export type Direction = 'forward' | 'return';
export type ChannelKey = 'cmd' | 'cur' | 'pil' | 'pos';

export interface Channel {
  key: ChannelKey;
  num: number;
  name: string;
  unit: string;
  color: string;
  /** единиц на деление */
  perDiv: number;
  /** положение нуля канала, делений от низа экрана */
  zeroDiv: number;
  digits: number;
  /** амплитуда шума, единиц канала */
  noise: number;
}

export const CHANNELS: Channel[] = [
  { key: 'cmd', num: 1, name: 'Команда', unit: 'В', color: '#F2B43C', perDiv: 20, zeroDiv: 6.6, digits: 1, noise: 0.25 },
  { key: 'cur', num: 2, name: 'Ток катушки', unit: 'мА', color: '#44C18A', perDiv: 100, zeroDiv: 4.55, digits: 0, noise: 1.4 },
  { key: 'pil', num: 3, name: 'Давление упр.', unit: 'бар', color: '#8B6CFF', perDiv: 4, zeroDiv: 2.5, digits: 2, noise: 0.05 },
  { key: 'pos', num: 4, name: 'Ход золотника', unit: '%', color: '#1FB6CE', perDiv: 50, zeroDiv: 0.3, digits: 1, noise: 0.9 },
];

export const DIVS_X = 10;
export const DIVS_Y = 8;
/** Точка запуска (t = 0) — одно деление от левого края. */
export const PRE_DIVS = 1;
export const TIMEBASES = [1, 2, 5];
const SAMPLES = 801;

const TAU_MS = (VALVE_CONST.coilInductanceH / VALVE_CONST.coilResistanceOhm) * 1000;
const I_SS_MA = (DEFAULT_PARAMS.voltage / VALVE_CONST.coilResistanceOhm) * 1000;

export interface Capture {
  dir: Direction;
  sim: SimResult;
  /** эталон: момент 90% (прямой) или 10% (обратный) хода, мс от команды */
  target: number;
  level: number;
  tb: number;
  t0: number;
  dt: number;
  data: Record<ChannelKey, Float32Array>;
}

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const seriesAt = (series: SimPoint[], t: number): SimPoint => {
  if (t <= series[0].t) return series[0];
  const last = series[series.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  const k = (t - a.t) / (b.t - a.t || 1);
  return { t, p: a.p + (b.p - a.p) * k, x: a.x + (b.x - a.x) * k };
};

const clean = (dir: Direction, sim: SimResult, t: number): Record<ChannelKey, number> => {
  const fwd = dir === 'forward';
  if (t < 0) {
    return fwd
      ? { cmd: 0, cur: 0, pil: 0, pos: 0 }
      : { cmd: DEFAULT_PARAMS.voltage, cur: I_SS_MA, pil: DEFAULT_PARAMS.supplyBar, pos: 100 };
  }
  const s = seriesAt(sim.series, t);
  return {
    cmd: fwd ? DEFAULT_PARAMS.voltage : 0,
    cur: fwd ? I_SS_MA * (1 - Math.exp(-t / TAU_MS)) : I_SS_MA * Math.exp(-t / TAU_MS),
    pil: Math.max(0, s.p),
    pos: s.x,
  };
};

const sims: Partial<Record<Direction, SimResult>> = {};
const getSim = (dir: Direction) => {
  if (!sims[dir]) sims[dir] = dir === 'forward' ? simulate(DEFAULT_PARAMS) : simulateReturn(DEFAULT_PARAMS);
  return sims[dir] as SimResult;
};

/** Подходящая развёртка: весь переход должен уместиться в экран. */
export const autoTimebase = (dir: Direction) => {
  const sim = getSim(dir);
  return TIMEBASES.find((tb) => tb * (DIVS_X - PRE_DIVS) >= sim.tTotal * 1.15) ?? TIMEBASES[TIMEBASES.length - 1];
};

export const capture = (dir: Direction, tb: number, noisy: boolean): Capture | null => {
  const sim = getSim(dir);
  if (!sim.ok) return null;
  const fwd = dir === 'forward';
  const level = fwd ? 90 : 10;
  const target = crossingTime(sim.series, level, fwd) ?? sim.tTotal;
  const t0 = -PRE_DIVS * tb;
  const dt = (DIVS_X * tb) / (SAMPLES - 1);
  const data = {
    cmd: new Float32Array(SAMPLES),
    cur: new Float32Array(SAMPLES),
    pil: new Float32Array(SAMPLES),
    pos: new Float32Array(SAMPLES),
  };
  const rnd = mulberry32((fwd ? 11 : 29) + tb * 101);
  for (let i = 0; i < SAMPLES; i++) {
    const v = clean(dir, sim, t0 + i * dt);
    for (const ch of CHANNELS) {
      // треугольное распределение ~ гауссово, без лишней математики
      const n = noisy ? (rnd() + rnd() - 1) * ch.noise : 0;
      data[ch.key][i] = v[ch.key] + n;
    }
  }
  return { dir, sim, target, level, tb, t0, dt, data };
};

/** Значение канала в момент t по записанным отсчётам (как у настоящего осциллографа). */
export const valueAt = (cap: Capture, key: ChannelKey, t: number) => {
  const arr = cap.data[key];
  const f = (t - cap.t0) / cap.dt;
  const i = Math.max(0, Math.min(arr.length - 2, Math.floor(f)));
  const k = Math.max(0, Math.min(1, f - i));
  return arr[i] + (arr[i + 1] - arr[i]) * k;
};
