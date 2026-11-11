// Кинематика 3D-модели: всё движение берётся из физической модели стенда (valveModel),
// а не из условной анимации. Модельное время (мс) растягивается в экранное (с) коэффициентом K.

import {
  DEFAULT_PARAMS,
  SimPoint,
  VALVE_CONST,
  crossingTime,
  positionAt,
  simulate,
  simulateReturn,
} from '../lib/valveModel';

/** cycle — непрерывные переключения, replay — замедленный прямой ход, both — прямой и обратный ход. */
export type Mode = 'cycle' | 'replay' | 'both';

export interface ValveState {
  /** команда на катушке */
  command: boolean;
  /** идёт прямой ход (иначе обратный или покой) */
  forward: boolean;
  /** ток катушки, доля установившегося */
  current: number;
  /** якорь пилота: 0 — закрыт, 1 — открыт */
  armature: number;
  /** давление в пилотной камере, доля давления питания */
  pilot: number;
  /** ход золотника, 0…1 */
  x: number;
  /** модельное время от фронта команды, мс */
  tMs: number;
  /** 0 — покой/упор, 1 — ток, 2 — якорь, 3 — камера, 4 — ход золотника */
  phase: 0 | 1 | 2 | 3 | 4;
  /** во сколько раз замедлено по сравнению с реальностью; 0 — участок не по модели */
  slow: number;
}

const params = DEFAULT_PARAMS;
const fwd = simulate(params);
const ret = simulateReturn(params);
const tauMs = (VALVE_CONST.coilInductanceH / VALVE_CONST.coilResistanceOhm) * 1000;

export const MODEL = {
  fwd,
  ret,
  supplyBar: params.supplyBar,
  t90: crossingTime(fwd.series, 90, true) ?? fwd.tTotal,
  t10: crossingTime(ret.series, 10, false) ?? ret.tTotal,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const pressureAt = (series: SimPoint[], tMs: number) => {
  if (series.length === 0) return 0;
  if (tMs <= series[0].t) return series[0].p;
  for (let i = 1; i < series.length; i++) {
    const b = series[i];
    if (tMs <= b.t) {
      const a = series[i - 1];
      return a.p + ((tMs - a.t) / (b.t - a.t || 1)) * (b.p - a.p);
    }
  }
  return series[series.length - 1].p;
};

const phaseOf = (t: number, tCoil: number, tArmature: number, tDelay: number, tTotal: number): ValveState['phase'] => {
  if (t < tCoil) return 1;
  if (t < tCoil + tArmature) return 2;
  if (t < tDelay) return 3;
  if (t < tTotal) return 4;
  return 0;
};

const forwardAt = (t: number, slow: number): ValveState => ({
  command: true,
  forward: true,
  current: 1 - Math.exp(-t / tauMs),
  armature: smoothstep(fwd.tCoil, fwd.tCoil + fwd.tArmature, t),
  pilot: clamp01(pressureAt(fwd.series, t) / params.supplyBar),
  x: clamp01(positionAt(fwd.series, t) / 100),
  tMs: t,
  phase: phaseOf(t, fwd.tCoil, fwd.tArmature, fwd.tDelay, fwd.tTotal),
  slow,
});

const returnAt = (t: number, slow: number): ValveState => ({
  command: false,
  forward: false,
  current: Math.exp(-t / tauMs),
  armature: 1 - smoothstep(ret.tCoil, ret.tCoil + ret.tArmature, t),
  pilot: clamp01(pressureAt(ret.series, t) / params.supplyBar),
  x: clamp01(positionAt(ret.series, t) / 100),
  tMs: t,
  phase: phaseOf(t, ret.tCoil, ret.tArmature, ret.tDelay, ret.tTotal),
  slow,
});

const REST: ValveState = { command: false, forward: false, current: 0, armature: 0, pilot: 0, x: 0, tMs: 0, phase: 0, slow: 0 };

/** Состояние распределителя в момент time (с) от начала режима. */
export const sample = (mode: Mode, time: number): ValveState => {
  if (mode === 'cycle') {
    const k = 0.07;
    const on = fwd.tTotal * k + 1.5;
    const off = ret.tTotal * k + 1.5;
    const t = time % (on + off);
    return t < on ? forwardAt(t / k, k * 1000) : returnAt((t - on) / k, k * 1000);
  }

  if (mode === 'both') {
    const k = 0.26;
    const on = (fwd.tTotal + 1) * k + 1;
    const off = (ret.tTotal + 1) * k + 1;
    const t = time % (on + off);
    return t < on ? forwardAt(t / k, k * 1000) : returnAt((t - on) / k, k * 1000);
  }

  // replay: прямой ход по модели, затем быстрый условный возврат
  const k = 0.42;
  const play = (fwd.tTotal + 1.2) * k + 1.2;
  const back = 0.7;
  const rest = 0.6;
  const t = time % (play + back + rest);
  if (t < play) return forwardAt(t / k, k * 1000);
  if (t < play + back) {
    const f = 1 - smoothstep(0, 1, (t - play) / back);
    return { ...REST, x: f, pilot: f, armature: f };
  }
  return REST;
};
