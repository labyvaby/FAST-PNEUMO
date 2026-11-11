import React, { useMemo, useState } from 'react';
import { FaRotate } from 'react-icons/fa6';
import { DEFAULT_PARAMS, SimPoint, VALVE_CONST, crossingTime, simulate } from '../../lib/valveModel';
import { RigAnalysis, RigConfig, Target } from './rig';

// Что запишет регистратор: «истинное» переключение по модели, пропущенное через выбранные приборы.
// Форма кривых — из физической модели, масштаб по времени — под ожидаемое tполн из конфигуратора.

const W = 1000;
const LANE_H = 112;
const PAD_T = 22;
const PAD_B = 18;
const GRID = 6000;
const MAX_DOTS = 220;

const SIM = simulate(DEFAULT_PARAMS);
const T90_MODEL = crossingTime(SIM.series, 90, true) ?? SIM.tTotal;
const TAU_COIL = (VALVE_CONST.coilInductanceH / VALVE_CONST.coilResistanceOhm) * 1000;

const COLOR = { cmd: '#F2B43C', x: '#1FB6CE', p: '#8B6CFF' } as const;

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

const interp = (series: SimPoint[], t: number, key: 'x' | 'p') => {
  if (t <= series[0].t) return series[0][key];
  const last = series[series.length - 1];
  if (t >= last.t) return last[key];
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  return a[key] + ((t - a.t) / (b.t - a.t || 1)) * (b[key] - a[key]);
};

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',').replace('-', '−');

interface Props {
  config: RigConfig;
  analysis: RigAnalysis;
  focus: Target | null;
  onFocus: (t: Target | null) => void;
}

interface Lane {
  key: 'cmd' | 'x' | 'p';
  label: string;
  channel: number;
  recorded: boolean;
  target: Target;
  truth: string;
  sensor: string | null;
  dots: { x: number; y: number }[];
  steps: string | null;
  dense: boolean;
  extra?: React.ReactNode;
}

export const RecordPreview: React.FC<Props> = ({ config: c, analysis: a, focus, onFocus }) => {
  const [seed, setSeed] = useState(1);
  const [history, setHistory] = useState<{ key: string; values: number[] }>({ key: '', values: [] });

  const configKey = JSON.stringify(c);

  const result = useMemo(() => {
    const rnd = mulberry32(seed * 7919 + 13);
    const k = c.expectedMs / SIM.tTotal;
    const drv = a.driverDelay;
    const span = (drv + c.expectedMs) * 1.12;
    const t0 = -span * 0.07;
    const t1 = span;
    const toX = (t: number) => ((t - t0) / (t1 - t0)) * W;

    // джиттер команды сдвигает реальный старт относительно записанного t0;
    // при t0 по току катушки отсчёт идёт от самого старта, и джиттер команды не важен
    const jitter = (rnd() * 2 - 1) * a.t0Error;
    const valveStart = drv + (c.current ? 0 : jitter);
    const T = a.sampleMs;
    const phase = rnd() * T;
    const laserT = 1 / c.laserKHz;
    const laserPhase = rnd() * laserT;

    const xTrue = (t: number) => interp(SIM.series, (t - valveStart) / k, 'x');
    const pTrue = (t: number) => Math.max(0, interp(SIM.series, (t - valveStart) / k, 'p'));
    const iTrue = (t: number) => (t < valveStart ? 0 : 1 - Math.exp(-(t - valveStart) / (TAU_COIL * k)));

    // сетка для инерционных датчиков
    const dt = (t1 - t0) / (GRID - 1);
    const lvdtTau = 1000 / (2 * Math.PI * c.lvdtHz);
    const lvdt = new Float32Array(GRID);
    const pSens = new Float32Array(GRID);
    let yx = 0;
    let yp = 0;
    for (let i = 0; i < GRID; i++) {
      const t = t0 + i * dt;
      yx += (xTrue(t) - yx) * (1 - Math.exp(-dt / lvdtTau));
      lvdt[i] = yx;
      const target = pTrue(t - a.tubeDelay);
      yp += c.pressureResp > 0 ? (target - yp) * (1 - Math.exp(-dt / c.pressureResp)) : target - yp;
      pSens[i] = yp;
    }
    const fromGrid = (arr: Float32Array, t: number) => {
      const f = (t - t0) / dt;
      const i = Math.max(0, Math.min(GRID - 2, Math.floor(f)));
      return arr[i] + (arr[i + 1] - arr[i]) * Math.min(1, Math.max(0, f - i));
    };

    const xSensor = (t: number) => {
      if (c.disp === 'laser') return xTrue(Math.floor((t - laserPhase) / laserT) * laserT + laserPhase);
      if (c.disp === 'lvdt') return fromGrid(lvdt, t);
      if (c.disp === 'inductive') return xTrue(t) >= 98 ? 100 : 0;
      return 0;
    };
    const pSensor = (t: number) => fromGrid(pSens, t);
    const cmdSensor = (t: number) => (c.current ? iTrue(t) * 100 : t >= 0 ? 100 : 0);

    // отсчёты регистратора: s_n = phase + n·T
    const firstN = Math.ceil((t0 - phase) / T);
    const lastN = Math.floor((t1 - phase) / T);
    const count = lastN - firstN + 1;
    const dense = count > MAX_DOTS;

    let t0Meas: number | null = null;
    let t90Meas: number | null = null;
    // фронт тока ловится по 1% установившегося значения
    const iThreshold = 1;
    for (let n = Math.max(firstN, Math.ceil((-phase) / T) - 1); n <= lastN; n++) {
      const s = phase + n * T;
      if (s < 0 && !c.current) continue;
      if (t0Meas === null && cmdSensor(s) >= (c.current ? iThreshold : 50)) t0Meas = s;
      if (t0Meas !== null && t90Meas === null && c.disp !== 'none' && xSensor(s) >= 90) {
        t90Meas = s;
        break;
      }
    }

    const POINTS = 700;
    const lanePath = (fn: (t: number) => number, yOf: (v: number) => number) => {
      let d = '';
      for (let i = 0; i < POINTS; i++) {
        const t = t0 + (i / (POINTS - 1)) * (t1 - t0);
        d += `${i ? 'L' : 'M'}${toX(t).toFixed(1)} ${yOf(fn(t)).toFixed(1)}`;
      }
      return d;
    };
    const samplesOf = (fn: (t: number) => number, yOf: (v: number) => number) => {
      if (dense) return { dots: [], steps: null };
      const dots: { x: number; y: number }[] = [];
      let steps = '';
      for (let n = firstN; n <= lastN; n++) {
        const s = phase + n * T;
        const p = { x: toX(s), y: yOf(fn(s)) };
        steps += dots.length ? ` H${p.x.toFixed(1)} V${p.y.toFixed(1)}` : `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        dots.push(p);
      }
      return { dots, steps };
    };

    const yIn = (lo: number, hi: number) => (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (LANE_H - PAD_T - PAD_B);
    const lanes: Lane[] = a.signals.map((sig) => {
      if (sig.key === 'cmd') {
        const y = yIn(0, 100);
        return {
          key: 'cmd',
          label: sig.label,
          channel: sig.channel,
          recorded: sig.recorded,
          target: c.current ? 'current' : 'pulse',
          truth: lanePath(cmdSensor, y),
          sensor: lanePath(cmdSensor, y),
          ...samplesOf(cmdSensor, y),
          dense,
        };
      }
      if (sig.key === 'x') {
        const y = yIn(0, 100);
        return {
          key: 'x',
          label: sig.label,
          channel: sig.channel,
          recorded: sig.recorded,
          target: 'disp',
          truth: lanePath(xTrue, y),
          sensor: lanePath(xSensor, y),
          ...samplesOf(xSensor, y),
          dense,
          extra: (
            <>
              <line x1='0' x2={W} y1={y(90)} y2={y(90)} className='rp-level' />
              <text x={W - 8} y={y(90) - 6} textAnchor='end' className='rp-level-t'>90%</text>
            </>
          ),
        };
      }
      const pMax = DEFAULT_PARAMS.supplyBar * 1.05;
      const y = yIn(0, pMax);
      return {
        key: 'p',
        label: sig.label,
        channel: sig.channel,
        recorded: sig.recorded,
        target: c.tubeCm > 10 ? 'tube' : 'pressure',
        truth: lanePath(pTrue, y),
        sensor: lanePath(pSensor, y),
        ...samplesOf(pSensor, y),
        dense,
      };
    });

    const xLane = a.signals.find((s) => s.key === 'x');
    const xRecorded = !!xLane?.recorded;
    const measured = xRecorded && t0Meas !== null && t90Meas !== null && c.disp !== 'inductive' ? t90Meas - t0Meas : null;
    const truthMs = T90_MODEL * k;

    return {
      lanes,
      toX,
      t0,
      t1,
      dense,
      count,
      measured,
      truthMs,
      t0Meas,
      t90Meas,
      t90True: valveStart + T90_MODEL * k,
      xRecorded,
    };
  }, [c, a, seed]);

  const values = history.key === configKey ? history.values : [];
  const reroll = () => {
    if (result.measured !== null) {
      setHistory({ key: configKey, values: [...values, result.measured].slice(-16) });
    }
    setSeed((s) => s + 1);
  };

  const { lanes, toX, measured, truthMs } = result;
  const H = lanes.length * LANE_H + 34;
  const err = measured !== null ? measured - truthMs : null;
  const scatter = measured !== null ? [...values, measured] : values;
  const spread = Math.max(truthMs * 0.02, ...scatter.map((v) => Math.abs(v - truthMs))) * 1.25;

  // шкала времени
  const ticks: number[] = [];
  const stepMs = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((s) => (result.t1 - result.t0) / s <= 10) ?? 50;
  for (let t = 0; t <= result.t1; t += stepMs) ticks.push(t);

  return (
    <div className='rp'>
      <div className='rp-head'>
        <div className={`rp-result ${measured === null ? 'is-bad' : Math.abs(err ?? 0) / truthMs <= 0.01 ? 'is-good' : Math.abs(err ?? 0) / truthMs <= 0.05 ? 'is-ok' : 'is-bad'}`}>
          <span>Истинное tср распределителя</span>
          <b>{fmt(truthMs)} мс</b>
          <i>→</i>
          <span>стенд записал</span>
          <b>{measured === null ? '—' : `${fmt(measured)} мс`}</b>
          {err !== null && (
            <em>
              {err >= 0 ? '+' : ''}
              {fmt(err)} мс · {fmt((Math.abs(err) / truthMs) * 100, 1)}%
            </em>
          )}
          {measured === null && (
            <em>
              {!result.xRecorded
                ? 'ход золотника не записан'
                : c.disp === 'inductive'
                  ? 'концевик не видит 90% хода'
                  : 'порог не пойман'}
            </em>
          )}
        </div>
        <button type='button' className='rp-reroll' onClick={reroll} title='Ещё одно переключение: другой джиттер и другая фаза отсчётов'>
          <FaRotate /> Ещё запись
        </button>
      </div>

      {scatter.length > 0 && (
        <div className='rp-scatter' aria-label='Разброс результатов по записям'>
          <span>разброс по записям</span>
          <div className='rp-scatter-track'>
            <i className='rp-truth' style={{ left: '50%' }} />
            {scatter.map((v, i) => (
              <b
                key={i}
                className={i === scatter.length - 1 ? 'is-last' : ''}
                style={{ left: `${50 + ((v - truthMs) / spread) * 50}%` }}
                title={`${fmt(v)} мс`}
              />
            ))}
          </div>
          <span>±{fmt(spread / 1.25)} мс</span>
        </div>
      )}

      <svg className='rp-svg' viewBox={`0 0 ${W} ${H}`} role='img' aria-label='Сигналы, как их запишет регистратор'>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={toX(t)} x2={toX(t)} y1='0' y2={H - 26} className='rp-grid' />
            <text x={toX(t)} y={H - 8} textAnchor='middle' className='rp-tick'>
              {fmt(t, stepMs < 1 ? 1 : 0)}
            </text>
          </g>
        ))}

        {lanes.map((lane, i) => {
          const dim = focus !== null && focus !== lane.target;
          return (
            <g
              key={lane.key}
              transform={`translate(0 ${i * LANE_H})`}
              className={`rp-lane ${dim ? 'is-dim' : ''} ${!lane.recorded ? 'is-lost' : ''}`}
              onMouseEnter={() => onFocus(lane.target)}
              onMouseLeave={() => onFocus(null)}
              style={{ '--c': COLOR[lane.key] } as React.CSSProperties}
            >
              <rect x='0' y='2' width={W} height={LANE_H - 4} rx='10' className='rp-lane-bg' />
              <text x='12' y='18' className='rp-lane-t'>
                CH{lane.channel} · {lane.label.toLowerCase()}
              </text>
              {lane.recorded ? (
                <>
                  {lane.extra}
                  <path d={lane.truth} className='rp-truth-line' />
                  {lane.sensor && <path d={lane.sensor} className='rp-sensor' />}
                  {lane.steps && <path d={lane.steps} className='rp-steps' />}
                  {lane.dots.map((p, j) => (
                    <circle key={j} cx={p.x} cy={p.y} r='2.6' className='rp-dot' />
                  ))}
                </>
              ) : (
                <text x={W / 2} y={LANE_H / 2 + 6} textAnchor='middle' className='rp-lost-t'>
                  нет свободного канала — сигнал не записан
                </text>
              )}
            </g>
          );
        })}

        {/* моменты t0 и t90: как записано */}
        {result.t0Meas !== null && (
          <g className='rp-mark is-t0'>
            <line x1={toX(result.t0Meas)} x2={toX(result.t0Meas)} y1='0' y2={H - 26} />
            <text x={toX(result.t0Meas) + 5} y={H - 30}>t0</text>
          </g>
        )}
        {result.t90Meas !== null && result.xRecorded && c.disp !== 'inductive' && (
          <>
            <line x1={toX(result.t90True)} x2={toX(result.t90True)} y1='0' y2={H - 26} className='rp-true90' />
            <g className='rp-mark is-t90'>
              <line x1={toX(result.t90Meas)} x2={toX(result.t90Meas)} y1='0' y2={H - 26} />
              <text x={toX(result.t90Meas) + 5} y={H - 30}>t90</text>
            </g>
          </>
        )}
      </svg>

      <div className='rp-legend'>
        <span><i className='l-truth' />что происходит на самом деле</span>
        <span><i className='l-sensor' />выход датчика</span>
        <span><i className='l-dot' />{result.dense ? `отсчёты регистратора (${result.count} — чаще пикселя)` : 'отсчёты регистратора'}</span>
        <span><i className='l-true90' />истинные 90% хода</span>
      </div>
    </div>
  );
};
