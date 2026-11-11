// Упрощённая модель переключения распределителя 5/2 с электропневматическим (пилотным) управлением.
//
// Переключение делится на три фазы:
//  1. электромагнитная: ток катушки растёт как i(t) = U/R · (1 − e^(−t/τ)), τ = L/R;
//     якорь трогается, когда ток достигает тока срабатывания I_ср;
//  2. наполнение пилотной камеры через канал диаметром d (расход через отверстие,
//     критический и докритический режим, изотермический процесс) до момента,
//     когда сила давления превысит усилие пружины и трение покоя;
//  3. движение золотника массой m: m·x'' = (p − pатм)·A − (F0 + k·x) − Fтр·sign(v) − c·v
//     до упора (полный ход).
//
// tзад = фазы 1 + 2, tдвиж = фаза 3, tполн = tзад + tдвиж.
// Константы ниже — типичные порядки величин для малого распределителя, а не данные конкретной модели.

export interface ValveParams {
  /** избыточное давление питания, бар */
  supplyBar: number;
  /** масса золотника, г */
  spoolMassG: number;
  /** ход золотника, мм */
  strokeMm: number;
  /** диаметр пилотного канала, мм */
  channelMm: number;
  /** коэффициент трения уплотнений μ */
  friction: number;
  /** напряжение на катушке, В */
  voltage: number;
  /** предварительный натяг возвратной пружины, Н (по умолчанию VALVE_CONST.springPreloadN) */
  springPreloadN?: number;
}

export const DEFAULT_PARAMS: ValveParams = {
  supplyBar: 6,
  spoolMassG: 20,
  strokeMm: 4,
  channelMm: 1,
  friction: 0.15,
  voltage: 24,
  springPreloadN: 8,
};

export const VALVE_CONST = {
  spoolDiameterMm: 10,
  springPreloadN: 8,
  springRateNmm: 1,
  sealNormalForceN: 30,
  dampingNsM: 3,
  pilotVolumeCm3: 0.5,
  dischargeCoef: 0.7,
  coilResistanceOhm: 160,
  coilInductanceH: 0.4,
  pullInCurrentA: 0.09,
  dropOutCurrentA: 0.04,
  armatureTravelMs: 1.5,
  tempK: 293,
};

const P_ATM = 101325;
const R_AIR = 287;
const K_AIR = 1.4;
const CRIT_RATIO = Math.pow(2 / (K_AIR + 1), K_AIR / (K_AIR - 1)); // ≈ 0.528

/** Массовый расход воздуха через отверстие площадью area, кг/с. */
export const orificeMassFlow = (pUp: number, pDown: number, area: number, cd: number, tempK: number) => {
  if (pUp <= pDown) return 0;
  const r = pDown / pUp;
  if (r <= CRIT_RATIO) {
    return (
      cd * area * pUp * Math.sqrt(K_AIR / (R_AIR * tempK)) *
      Math.pow(2 / (K_AIR + 1), (K_AIR + 1) / (2 * (K_AIR - 1)))
    );
  }
  return (
    cd * area * pUp *
    Math.sqrt(((2 * K_AIR) / ((K_AIR - 1) * R_AIR * tempK)) * (Math.pow(r, 2 / K_AIR) - Math.pow(r, (K_AIR + 1) / K_AIR)))
  );
};

export interface SimPoint {
  t: number; // мс от подачи команды
  p: number; // бар изб. в пилотной камере
  x: number; // % хода
}

export interface SimResult {
  ok: boolean;
  reason: string | null;
  /** время нарастания тока до тока срабатывания, мс */
  tCoil: number;
  /** ход якоря пилота, мс */
  tArmature: number;
  /** наполнение пилотной камеры до страгивания золотника, мс */
  tFill: number;
  tDelay: number;
  tMove: number;
  tTotal: number;
  /** минимальное давление питания, при котором золотник проходит полный ход, бар изб. */
  pMinBar: number;
  /** напряжение срабатывания катушки, В */
  uPullIn: number;
  series: SimPoint[];
}

export const spoolArea = () => (Math.PI * (VALVE_CONST.spoolDiameterMm / 1000) ** 2) / 4;

export const minSupplyBar = (params: ValveParams) => {
  const forceN =
    (params.springPreloadN ?? VALVE_CONST.springPreloadN) +
    VALVE_CONST.springRateNmm * params.strokeMm +
    params.friction * VALVE_CONST.sealNormalForceN;
  return forceN / spoolArea() / 1e5;
};

export const simulate = (params: ValveParams, withSeries = true): SimResult => {
  const c = VALVE_CONST;
  const uPullIn = c.pullInCurrentA * c.coilResistanceOhm;
  const pMinBar = minSupplyBar(params);
  const empty = { tCoil: 0, tArmature: 0, tFill: 0, tDelay: 0, tMove: 0, tTotal: 0, pMinBar, uPullIn, series: [] };

  if (params.voltage <= uPullIn) {
    return { ...empty, ok: false, reason: `Напряжение ${params.voltage} В ниже напряжения срабатывания катушки ≈ ${uPullIn.toFixed(1)} В: якорь пилота не притянется.` };
  }

  const tau = c.coilInductanceH / c.coilResistanceOhm;
  const tCoil = -tau * Math.log(1 - (c.pullInCurrentA * c.coilResistanceOhm) / params.voltage) * 1000;
  const tArmature = c.armatureTravelMs;
  const tOpen = tCoil + tArmature;

  const area = spoolArea();
  const orifice = (Math.PI * (params.channelMm / 1000) ** 2) / 4;
  const v0 = c.pilotVolumeCm3 * 1e-6;
  const mass = params.spoolMassG / 1000;
  const stroke = params.strokeMm / 1000;
  const pSupply = params.supplyBar * 1e5 + P_ATM;
  const fFriction = params.friction * c.sealNormalForceN;
  const k = c.springRateNmm * 1000;
  const rt = R_AIR * c.tempK;

  let air = (P_ATM * v0) / rt;
  let x = 0;
  let v = 0;
  let moving = false;
  let tStart: number | null = null;
  let tEnd: number | null = null;
  const dt = 2e-6;
  const tMax = 0.3;
  const series: SimPoint[] = [];
  const sampleEvery = 20;

  if (withSeries) {
    series.push({ t: 0, p: 0, x: 0 }, { t: tOpen, p: 0, x: 0 });
  }

  let step = 0;
  for (let t = 0; t < tMax; t += dt, step++) {
    const volume = v0 + area * x;
    const p = (air * rt) / volume;
    air += orificeMassFlow(pSupply, p, orifice, c.dischargeCoef, c.tempK) * dt;

    const fPressure = (p - P_ATM) * area;
    const fSpring = (params.springPreloadN ?? c.springPreloadN) + k * x;
    const net = fPressure - fSpring;

    if (tEnd === null) {
      if (!moving) {
        if (net > fFriction) {
          moving = true;
          if (tStart === null) tStart = t;
        } else if (p > pSupply * 0.999) {
          break;
        }
      }
      if (moving) {
        const a = (net - fFriction * Math.sign(v || 1) - c.dampingNsM * v) / mass;
        v += a * dt;
        x += v * dt;
        if (v <= 0 && net <= fFriction) {
          v = 0;
          moving = false;
        }
        if (x < 0) {
          x = 0;
          v = 0;
        }
        if (x >= stroke) {
          x = stroke;
          v = 0;
          moving = false;
          tEnd = t;
        }
      }
    }

    if (withSeries && step % sampleEvery === 0) {
      series.push({ t: tOpen + t * 1000, p: (p - P_ATM) / 1e5, x: (x / stroke) * 100 });
    }

    // после упора дописываем ещё ~40% времени, чтобы на графике было видно дозаполнение камеры
    if (tEnd !== null && (!withSeries || t > tEnd * 1.4 + 0.002)) break;
  }

  if (tStart === null || tEnd === null) {
    const reason =
      params.supplyBar < pMinBar
        ? `Давления ${params.supplyBar} бар не хватает: чтобы преодолеть пружину и трение на полном ходе, нужно не меньше ${pMinBar.toFixed(2)} бар.`
        : 'Золотник не дошёл до упора за 300 мс: проверьте сочетание параметров.';
    return { ...empty, tCoil, tArmature, ok: false, reason, series };
  }

  const tFill = tStart * 1000;
  const tDelay = tOpen + tFill;
  const tMove = (tEnd - tStart) * 1000;
  return {
    ok: true,
    reason: null,
    tCoil,
    tArmature,
    tFill,
    tDelay,
    tMove,
    tTotal: tDelay + tMove,
    pMinBar,
    uPullIn,
    series,
  };
};

// Обратный ход (катушку обесточили):
//  1. ток спадает i(t) = U/R · e^(−t/τ) до тока отпускания I_отп, якорь пилота возвращается;
//  2. пилотная камера стравливается через тот же канал в атмосферу, пока пружина не пересилит
//     давление и трение покоя;
//  3. пружина возвращает золотник: m·x'' = (p − pатм)·A − (F0 + k·x) − Fтр·sign(v) − c·v, до x = 0.
// В результате tCoil — спад тока до отпускания, tFill — стравливание камеры до страгивания.
export const simulateReturn = (params: ValveParams, withSeries = true): SimResult => {
  const c = VALVE_CONST;
  const uPullIn = c.pullInCurrentA * c.coilResistanceOhm;
  const pMinBar = minSupplyBar(params);
  const empty = { tCoil: 0, tArmature: 0, tFill: 0, tDelay: 0, tMove: 0, tTotal: 0, pMinBar, uPullIn, series: [] };

  const area = spoolArea();
  const stroke = params.strokeMm / 1000;
  const fFriction = params.friction * c.sealNormalForceN;
  if ((params.springPreloadN ?? c.springPreloadN) <= fFriction) {
    return { ...empty, ok: false, reason: `Трение ${fFriction.toFixed(1)} Н не меньше предварительного натяга пружины ${(params.springPreloadN ?? c.springPreloadN)} Н: золотник не вернётся до упора.` };
  }

  const tau = c.coilInductanceH / c.coilResistanceOhm;
  const i0 = params.voltage / c.coilResistanceOhm;
  const tCoil = i0 > c.dropOutCurrentA ? tau * Math.log(i0 / c.dropOutCurrentA) * 1000 : 0;
  const tArmature = c.armatureTravelMs;
  const tOpen = tCoil + tArmature;

  const orifice = (Math.PI * (params.channelMm / 1000) ** 2) / 4;
  const v0 = c.pilotVolumeCm3 * 1e-6;
  const mass = params.spoolMassG / 1000;
  const pSupply = params.supplyBar * 1e5 + P_ATM;
  const k = c.springRateNmm * 1000;
  const rt = R_AIR * c.tempK;

  let x = stroke;
  let air = (pSupply * (v0 + area * x)) / rt;
  let v = 0;
  let moving = false;
  let tStart: number | null = null;
  let tEnd: number | null = null;
  const dt = 2e-6;
  const tMax = 0.3;
  const series: SimPoint[] = [];
  const sampleEvery = 20;

  if (withSeries) {
    series.push({ t: 0, p: params.supplyBar, x: 100 }, { t: tOpen, p: params.supplyBar, x: 100 });
  }

  let step = 0;
  for (let t = 0; t < tMax; t += dt, step++) {
    const p = (air * rt) / (v0 + area * x);
    air = Math.max(0, air - orificeMassFlow(p, P_ATM, orifice, c.dischargeCoef, c.tempK) * dt);

    // положительное back — сила, возвращающая золотник к x = 0
    const back = (params.springPreloadN ?? c.springPreloadN) + k * x - (p - P_ATM) * area;

    if (tEnd === null) {
      if (!moving && back > fFriction) {
        moving = true;
        if (tStart === null) tStart = t;
      }
      if (moving) {
        // золотник идёт к x = 0 (v < 0), трение направлено против движения — в +x
        const friction = v > 0 ? -fFriction : fFriction;
        const a = (-back + friction - c.dampingNsM * v) / mass;
        v += a * dt;
        x += v * dt;
        if (v >= 0 && back <= fFriction) {
          v = 0;
          moving = false;
        }
        if (x <= 0) {
          x = 0;
          v = 0;
          moving = false;
          tEnd = t;
        }
      }
    }

    if (withSeries && step % sampleEvery === 0) {
      series.push({ t: tOpen + t * 1000, p: (p - P_ATM) / 1e5, x: (x / stroke) * 100 });
    }

    if (tEnd !== null && (!withSeries || t > tEnd * 1.4 + 0.002)) break;
  }

  if (tStart === null || tEnd === null) {
    return { ...empty, tCoil, tArmature, ok: false, reason: 'Золотник не вернулся до упора за 300 мс: проверьте сочетание параметров.', series };
  }

  const tFill = tStart * 1000;
  const tDelay = tOpen + tFill;
  const tMove = (tEnd - tStart) * 1000;
  return { ok: true, reason: null, tCoil, tArmature, tFill, tDelay, tMove, tTotal: tDelay + tMove, pMinBar, uPullIn, series };
};

/** Момент (мс), когда ход впервые проходит уровень level, %: вверх при rising, вниз иначе. Линейная интерполяция. */
export const crossingTime = (series: SimPoint[], level: number, rising: boolean): number | null => {
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    const crossed = rising ? a.x < level && b.x >= level : a.x > level && b.x <= level;
    if (crossed) return a.t + ((level - a.x) / (b.x - a.x)) * (b.t - a.t);
  }
  return null;
};

/** Положение золотника, % хода, в момент tMs от команды — по рассчитанной кривой. */
export const positionAt = (series: SimPoint[], tMs: number): number => {
  if (series.length === 0) return 0;
  if (tMs <= series[0].t) return series[0].x;
  for (let i = 1; i < series.length; i++) {
    const b = series[i];
    if (tMs <= b.t) {
      const a = series[i - 1];
      return a.x + ((tMs - a.t) / (b.t - a.t || 1)) * (b.x - a.x);
    }
  }
  return series[series.length - 1].x;
};

export type SweepKey = 'supplyBar' | 'spoolMassG';

export const SWEEPS: Record<SweepKey, { label: string; unit: string; from: number; to: number; step: number }> = {
  supplyBar: { label: 'давления питания', unit: 'бар', from: 2, to: 10, step: 0.25 },
  spoolMassG: { label: 'массы золотника', unit: 'г', from: 5, to: 50, step: 1.5 },
};

export const sweep = (params: ValveParams, key: SweepKey) => {
  const { from, to, step } = SWEEPS[key];
  const points: { x: number; y: number | null }[] = [];
  for (let value = from; value <= to + 1e-9; value += step) {
    const result = simulate({ ...params, [key]: +value.toFixed(3) }, false);
    points.push({ x: +value.toFixed(3), y: result.ok ? +result.tTotal.toFixed(2) : null });
  }
  return points;
};
