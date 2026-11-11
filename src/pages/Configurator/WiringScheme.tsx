import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PARAMS, positionAt, simulate } from '../../lib/valveModel';
import { DISP, DISP_SHORT, DRIVER, Level, PULSE, REC, RigAnalysis, RigConfig, Target } from './rig';

// Схема подключений стенда. Импульс команды проходит по цепочке с реальными задержками
// (время на экране сжато логарифмически — микросекунды и миллисекунды видны на одной анимации),
// проблемные элементы подсвечены, наведение связывает схему с рекомендациями.

const SIM = simulate(DEFAULT_PARAMS);
const REC_X = 820;
const REC_Y: Record<'cmd' | 'x' | 'p', number> = { cmd: 64, x: 206, p: 446 };
const SCREEN_S = 4.2;
const TAU0 = 0.01;

interface Props {
  config: RigConfig;
  analysis: RigAnalysis;
  focus: Target | null;
  onFocus: (t: Target | null) => void;
  playKey: number;
}

interface Leg {
  id: string;
  d: string;
  from: number;
  to: number;
  kind: 'ctl' | 'sig' | 'air';
}

interface Busy {
  target: Target;
  from: number;
  to: number;
}

interface BlockDef {
  target?: Target;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  kind?: 'ctl' | 'sensor';
}

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const fmtMs = (v: number) => (v < 0.1 ? `${fmt(v * 1000, 0)} мкс` : v < 1 ? `${fmt(v, 3)} мс` : `${fmt(v, 2)} мс`);

export const WiringScheme: React.FC<Props> = ({ config: c, analysis: a, focus, onFocus, playKey }) => {
  const [tm, setTm] = useState<number | null>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});

  // ---------- цепочка задержек ----------
  const { legs, busy, arrivals, tEnd } = useMemo(() => {
    const drv = a.driverDelay;
    const e90 = drv + c.expectedMs * 0.86;
    const pOpen = drv + c.expectedMs * 0.55;
    const T = a.sampleMs;
    const L: Leg[] = [{ id: 'ctl1', d: 'M195 68 H235', from: 0, to: 0.002, kind: 'ctl' }];
    const B: Busy[] = [
      { target: 'pulse', from: 0, to: 0.002 },
      { target: 'driver', from: 0.002, to: drv },
      { target: 'valve', from: drv, to: drv + c.expectedMs },
    ];
    L.push({ id: 'ctl2', d: 'M385 68 H485 V300', from: drv, to: drv * 1.08 + 0.004, kind: 'ctl' });
    const arr: { key: 'cmd' | 'x' | 'p'; t: number }[] = [];
    if (!c.current) {
      L.push({ id: 'cmd', d: `M215 68 V24 H800 V${REC_Y.cmd} H${REC_X}`, from: 0.002, to: 0.002 + Math.max(T, 0.004), kind: 'sig' });
      arr.push({ key: 'cmd', t: 0.002 + Math.max(T, 0.004) });
    } else {
      B.push({ target: 'current', from: drv, to: drv + 0.005 });
      L.push({ id: 'cur', d: `M560 172 H800 V${REC_Y.cmd} H${REC_X}`, from: drv + 0.005, to: drv + 0.005 + Math.max(T, 0.004), kind: 'sig' });
      arr.push({ key: 'cmd', t: drv + 0.005 + Math.max(T, 0.004) });
    }
    if (c.disp !== 'none') {
      L.push({ id: 'xlink', d: 'M685 300 V232', from: e90, to: e90 + 0.003, kind: 'sig' });
      B.push({ target: 'disp', from: e90 + 0.003, to: e90 + 0.003 + a.dispError });
      const out = e90 + 0.003 + a.dispError;
      L.push({ id: 'x', d: `M760 ${REC_Y.x} H${REC_X}`, from: out, to: out + Math.max(T, 0.004), kind: 'sig' });
      arr.push({ key: 'x', t: out + Math.max(T, 0.004) });
    }
    if (c.pressure) {
      L.push({ id: 'tube', d: 'M485 364 V420', from: pOpen, to: pOpen + Math.max(a.tubeDelay, 0.003), kind: 'air' });
      const atSensor = pOpen + Math.max(a.tubeDelay, 0.003);
      B.push({ target: 'tube', from: pOpen, to: atSensor });
      B.push({ target: 'pressure', from: atSensor, to: atSensor + c.pressureResp });
      const out = atSensor + c.pressureResp;
      L.push({ id: 'p', d: `M570 ${REC_Y.p} H${REC_X}`, from: out, to: out + Math.max(T, 0.004), kind: 'sig' });
      arr.push({ key: 'p', t: out + Math.max(T, 0.004) });
    }
    const end = Math.max(drv + c.expectedMs, ...arr.map((x) => x.t));
    return { legs: L, busy: B, arrivals: arr, tEnd: end * 1.04 };
  }, [c, a]);

  // ---------- анимация ----------
  useEffect(() => {
    if (playKey === 0) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const logSpan = Math.log(1 + tEnd / TAU0);
    let raf = 0;
    let hold = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const e = (now - start) / 1000;
      if (e <= SCREEN_S) {
        setTm(TAU0 * (Math.exp((e / SCREEN_S) * logSpan) - 1));
        raf = requestAnimationFrame(tick);
      } else {
        setTm(tEnd);
        hold = window.setTimeout(() => setTm(null), 1600);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hold);
      setTm(null);
    };
    // перезапуск только по команде, а не на каждый пересчёт цепочки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  // ---------- проблемы по элементам ----------
  const levelOf = useMemo(() => {
    const rank: Record<Level, number> = { ok: 0, info: 0, warn: 1, err: 2 };
    const out: Partial<Record<Target, Level>> = {};
    for (const n of a.notes) {
      if (!n.target || rank[n.level] === 0) continue;
      const prev = out[n.target];
      if (!prev || rank[n.level] > rank[prev]) out[n.target] = n.level;
    }
    return out;
  }, [a.notes]);

  const variance = a.budget.reduce((s, b) => s + b.value ** 2, 0) || 1;
  const shareOf = (t: Target) => {
    const item = a.budget.find((b) => b.target === t);
    return item ? Math.round((item.value ** 2 / variance) * 100) : null;
  };

  const blocks: BlockDef[] = [
    { target: 'pulse', x: 20, y: 40, w: 175, h: 64, title: PULSE[c.pulse].label, sub: PULSE[c.pulse].sub, kind: 'ctl' },
    { target: 'driver', x: 235, y: 40, w: 150, h: 64, title: 'Драйвер', sub: `${DRIVER[c.driver].short} · ${fmtMs(DRIVER[c.driver].delayMs)}`, kind: 'ctl' },
    ...(c.current ? [{ target: 'current' as Target, x: 410, y: 148, w: 150, h: 48, title: 'Датчик тока', sub: 'шунт в цепи', kind: 'sensor' as const }] : []),
    { x: 30, y: 300, w: 150, h: 64, title: 'Компрессор', sub: 'питание P' },
    { x: 215, y: 300, w: 150, h: 64, title: 'Подготовка', sub: 'фильтр, регулятор' },
    { target: 'valve', x: 400, y: 300, w: 170, h: 64, title: 'Распределитель 5/2', sub: 'испытуемый' },
    { x: 610, y: 300, w: 150, h: 64, title: 'Цилиндр', sub: 'или нагрузка' },
    ...(c.disp !== 'none' ? [{ target: 'disp' as Target, x: 610, y: 180, w: 150, h: 52, title: 'Датчик x', sub: DISP_SHORT[c.disp], kind: 'sensor' as const }] : []),
    ...(c.pressure
      ? [{ target: 'pressure' as Target, x: 400, y: 420, w: 170, h: 52, title: 'Датчик давления', sub: `отклик ${c.pressureResp} мс`, kind: 'sensor' as const }]
      : []),
  ];

  const tipText = (t: Target): { title: string; lines: string[] } => {
    const share = shareOf(t);
    const shareLine = share !== null ? [`вклад в погрешность: ${share}%`] : [];
    switch (t) {
      case 'pulse':
        return { title: PULSE[c.pulse].label, lines: [c.current ? 't0 берётся по току — джиттер команды не важен' : `джиттер t0 ±${fmtMs(a.t0Error)}`, ...shareLine] };
      case 'driver':
        return {
          title: DRIVER[c.driver].label,
          lines: [`задержка включения ${fmtMs(a.driverDelay)}`, c.current ? 'в результат не входит (t0 по току)' : 'прибавляется к каждому измерению'],
        };
      case 'current':
        return { title: 'Датчик тока катушки', lines: ['t0 по фронту тока ±5 мкс', ...shareLine] };
      case 'valve':
        return { title: 'Испытуемый распределитель', lines: [`ожидаемое tполн ${c.expectedMs} мс`, '1% от него — ориентир точности стенда'] };
      case 'disp':
        return { title: DISP[c.disp], lines: [`погрешность хода ±${fmtMs(a.dispError)}`, ...shareLine] };
      case 'tube':
        return { title: `Трубка ${c.tubeCm} см`, lines: [`волна давления идёт ${fmtMs(a.tubeDelay)}`, c.tubeCm > 10 ? 'длиннее 10 см — фронт размывается' : 'длина в норме'] };
      case 'pressure':
        return { title: 'Датчик давления', lines: [`отклик ${c.pressureResp} мс`, `кривая давления запаздывает на ${fmtMs(a.pressureLag)}`] };
      case 'recorder':
        return {
          title: REC[c.recorder].label,
          lines: [`шаг ${fmtMs(a.sampleMs)} · ${c.fsKHz} кГц`, `сигналов ${a.signals.length} из ${c.channels} каналов`, ...shareLine],
        };
    }
  };

  const isBusy = (t: Target) => tm !== null && busy.some((b) => b.target === t && tm >= b.from && tm <= b.to);
  const blockClass = (t?: Target) => {
    if (!t) return focus ? 'is-dim' : '';
    const lvl = levelOf[t];
    return [
      lvl === 'err' ? 'is-err' : lvl === 'warn' ? 'is-warn' : '',
      focus === t ? 'is-focus' : focus ? 'is-dim' : '',
      isBusy(t) ? 'is-busy' : '',
    ].join(' ');
  };

  const valveX = tm !== null ? positionAt(SIM.series, Math.max(0, tm - a.driverDelay) * (SIM.tTotal / c.expectedMs)) : null;
  const tipTarget = focus;
  const tipBlock = tipTarget === 'recorder' ? { x: REC_X, y: 40, w: 140, h: 440 } : tipTarget === 'tube' ? { x: 470, y: 380, w: 30, h: 30 } : blocks.find((b) => b.target === tipTarget);
  const tip = tipTarget && tipBlock ? tipText(tipTarget) : null;

  const hover = (t?: Target) =>
    t
      ? {
          onMouseEnter: () => onFocus(t),
          onMouseLeave: () => onFocus(null),
          onFocus: () => onFocus(t),
          onBlur: () => onFocus(null),
          tabIndex: 0,
          role: 'button',
          'aria-label': tipText(t).title,
        }
      : {};

  const recLevel = levelOf.recorder;

  return (
    <div className='wiring-wrap'>
      <svg className={`wiring ${tm !== null ? 'is-playing' : ''}`} viewBox='0 0 980 500' role='img' aria-label='Схема подключений испытательного стенда' style={{ minWidth: 640 }}>
        {/* воздух */}
        <path className='air' d='M180 332 H215 M365 332 H400 M570 332 H610' />
        {/* управление */}
        <path className='ctl-line' d='M195 68 H235 M385 68 H485 V300' />
        {/* сигналы на регистратор */}
        {!c.current && <path className='sig' d={`M215 68 V24 H800 V${REC_Y.cmd} H${REC_X}`} />}
        {c.current && <path className='sig' d={`M560 172 H800 V${REC_Y.cmd} H${REC_X}`} />}
        {c.disp !== 'none' && <path className='sig' d={`M760 ${REC_Y.x} H${REC_X}`} />}
        {c.disp !== 'none' && <path className='sig' d='M685 232 V300' strokeDasharray='4 4' />}
        {c.pressure && (
          <g {...hover('tube')} className={`tube ${blockClass('tube')}`}>
            <path className={`air ${c.tubeCm > 10 ? 'long' : ''}`} d='M485 364 V420' style={{ strokeWidth: 2.5 }} />
            <rect x='470' y='364' width='130' height='56' fill='transparent' />
            <text className={`lbl ${c.tubeCm > 10 ? 'bad' : ''}`} x='496' y='398'>
              трубка {c.tubeCm} см
            </text>
          </g>
        )}
        {c.pressure && <path className='sig' d={`M570 ${REC_Y.p} H${REC_X}`} />}

        {/* бегущий импульс */}
        {tm !== null &&
          legs.map((leg) => {
            const frac = Math.min(1, Math.max(0, (tm - leg.from) / (leg.to - leg.from || 1e-9)));
            if (tm < leg.from) return null;
            const el = pathRefs.current[leg.id];
            const head = el && frac < 1 ? el.getPointAtLength(frac * el.getTotalLength()) : null;
            return (
              <g key={leg.id} className={`pulse pulse-${leg.kind}`}>
                <path
                  ref={(node) => {
                    pathRefs.current[leg.id] = node;
                  }}
                  d={leg.d}
                  pathLength={1}
                  strokeDasharray='1'
                  strokeDashoffset={1 - frac}
                  className='pulse-trail'
                />
                {head && <circle cx={head.x} cy={head.y} r='6' className='pulse-head' />}
              </g>
            );
          })}

        {blocks.map((b) => (
          <g key={b.title} className={`blk ${b.kind ?? ''} ${blockClass(b.target)}`} {...hover(b.target)}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx='12' />
            <text x={b.x + 12} y={b.y + b.h / 2 - 2}>{b.title}</text>
            <text className='sub' x={b.x + 12} y={b.y + b.h / 2 + 15}>{b.sub}</text>
            {b.target === 'valve' && valveX !== null && (
              <rect x={b.x + 6} y={b.y + b.h - 8} width={((b.w - 12) * Math.min(100, Math.max(0, valveX))) / 100} height='3' rx='1.5' className='valve-progress' />
            )}
          </g>
        ))}

        <g className={`blk rec ${blockClass('recorder')}`} {...hover('recorder')}>
          <rect x={REC_X} y='40' width='140' height='440' rx='14' />
          <text x={REC_X + 14} y='100'>{REC[c.recorder].label}</text>
          <text className='sub' x={REC_X + 14} y='118'>
            {c.fsKHz} кГц · {c.channels} кан.
          </text>
        </g>
        {a.signals.map((s) => {
          const arrived = tm !== null && arrivals.some((x) => x.key === s.key && tm >= x.t);
          return (
            <g key={s.key} className={`ch-slot ${!s.recorded ? 'is-lost' : ''} ${arrived ? 'is-hit' : ''}`}>
              <circle cx={REC_X} cy={REC_Y[s.key]} r='6' />
              <text className='ch' x={REC_X + 14} y={REC_Y[s.key] + 4}>
                CH{s.channel} · {s.recorded ? s.label.toLowerCase() : 'нет канала'}
              </text>
            </g>
          );
        })}
        {recLevel && <circle cx={REC_X + 140} cy='40' r='9' className={`badge ${recLevel}`} />}

        {tm !== null && (
          <g className='clock'>
            <rect x='30' y='440' width='200' height='28' rx='14' />
            <text x='130' y='459' textAnchor='middle'>
              t = {fmtMs(tm)}
            </text>
          </g>
        )}
      </svg>

      {tip && tipBlock && (
        <div
          // у верхних блоков подсказка снизу, иначе её срежет край карточки
          className={`wiring-tip ${tipTarget === 'recorder' ? 'is-left' : tipBlock.y < 150 ? 'is-below' : ''}`}
          style={{
            left: `${((tipTarget === 'recorder' ? tipBlock.x - 8 : tipBlock.x + tipBlock.w / 2) / 980) * 100}%`,
            top: `${((tipTarget === 'recorder' ? tipBlock.y + 90 : tipBlock.y < 150 ? tipBlock.y + tipBlock.h + 8 : tipBlock.y - 8) / 500) * 100}%`,
          }}
          role='tooltip'
        >
          <b>{tip.title}</b>
          {tip.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
};
