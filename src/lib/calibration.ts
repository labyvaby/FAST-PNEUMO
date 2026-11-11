// Калибровка модели по даташиту: подбираем диаметр пилотного канала d и натяг пружины F0 так,
// чтобы расчётные tвкл (90% хода) и tвыкл (10% хода) совпали с временами из даташита.
//
// Почему именно эти два параметра:
//  • d задаёт общую «скорость пневматики» — наполнение и стравливание пилотной камеры;
//  • F0 задаёт соотношение вкл/выкл: сильнее пружина — дольше включение и быстрее возврат.
// Две цели, два неизвестных — задача определена. Остальные параметры остаются как в расчёте.
//
// Поиск: грубая сетка по d × F0, затем покоординатный спуск с уменьшением шага.

import { ValveParams, VALVE_CONST, crossingTime, simulate, simulateReturn } from './valveModel';

export const CALIBRATION_BOUNDS = {
  channelMm: { min: 0.3, max: 3 },
  springPreloadN: { max: 45 },
};

export interface ResponsePair {
  onMs: number;
  offMs: number;
}

export interface CalibrationResult extends ResponsePair {
  params: ValveParams;
  /** относительная ошибка, % (со знаком: + модель медленнее даташита) */
  errOnPct: number;
  errOffPct: number;
  evaluations: number;
}

/** tвкл и tвыкл модели: от команды до 90% хода вперёд и до 10% хода назад, мс. */
export const responseTimes = (params: ValveParams): ResponsePair | null => {
  const forward = simulate(params);
  const reverse = simulateReturn(params);
  if (!forward.ok || !reverse.ok) return null;
  const onMs = crossingTime(forward.series, 90, true);
  const offMs = crossingTime(reverse.series, 10, false);
  return onMs === null || offMs === null ? null : { onMs, offMs };
};

const minPreload = (params: ValveParams) => params.friction * VALVE_CONST.sealNormalForceN + 0.5;

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const calibrate = async (
  base: ValveParams,
  target: ResponsePair,
  onProgress?: (share: number) => void
): Promise<CalibrationResult | null> => {
  const fMin = minPreload(base);
  const fMax = CALIBRATION_BOUNDS.springPreloadN.max;
  const { min: dMin, max: dMax } = CALIBRATION_BOUNDS.channelMm;
  const clampD = (d: number) => Math.min(dMax, Math.max(dMin, d));
  const clampF = (f: number) => Math.min(fMax, Math.max(fMin, f));

  let evaluations = 0;
  const cache = new Map<string, { error: number; times: ResponsePair | null }>();
  const evaluate = (d: number, f: number) => {
    const key = `${d.toFixed(4)}|${f.toFixed(3)}`;
    const hit = cache.get(key);
    if (hit) return hit;
    evaluations++;
    const times = responseTimes({ ...base, channelMm: d, springPreloadN: f });
    const error = times
      ? ((times.onMs - target.onMs) / target.onMs) ** 2 + ((times.offMs - target.offMs) / target.offMs) ** 2
      : Infinity;
    const entry = { error, times };
    cache.set(key, entry);
    return entry;
  };

  // 1. грубая сетка
  const gridD = 12;
  const gridF = 11;
  let best = { d: base.channelMm, f: clampF(base.springPreloadN ?? VALVE_CONST.springPreloadN), error: Infinity };
  for (let i = 0; i < gridD; i++) {
    const d = dMin + ((dMax - dMin) * i) / (gridD - 1);
    for (let j = 0; j < gridF; j++) {
      const f = fMin + ((fMax - fMin) * j) / (gridF - 1);
      const { error } = evaluate(d, f);
      if (error < best.error) best = { d, f, error };
    }
    onProgress?.(((i + 1) / gridD) * 0.6);
    await pause();
  }
  if (!Number.isFinite(best.error)) return null;

  // 2. покоординатный спуск с уменьшением шага
  let stepD = (dMax - dMin) / (gridD - 1) / 2;
  let stepF = (fMax - fMin) / (gridF - 1) / 2;
  let round = 0;
  const rounds = 9;
  while (round < rounds) {
    let moved = false;
    for (const [dd, df] of [
      [stepD, 0],
      [-stepD, 0],
      [0, stepF],
      [0, -stepF],
    ]) {
      const d = clampD(best.d + dd);
      const f = clampF(best.f + df);
      const { error } = evaluate(d, f);
      if (error < best.error) {
        best = { d, f, error };
        moved = true;
      }
    }
    if (!moved) {
      stepD /= 2;
      stepF /= 2;
      round++;
      onProgress?.(0.6 + (round / rounds) * 0.4);
      await pause();
    }
  }

  const params = { ...base, channelMm: +best.d.toFixed(3), springPreloadN: +best.f.toFixed(2) };
  const times = responseTimes(params);
  if (!times) return null;
  return {
    params,
    ...times,
    errOnPct: ((times.onMs - target.onMs) / target.onMs) * 100,
    errOffPct: ((times.offMs - target.offMs) / target.offMs) * 100,
    evaluations,
  };
};
