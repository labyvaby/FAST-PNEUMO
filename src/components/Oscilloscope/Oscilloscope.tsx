import {
  CSSProperties,
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FaCheck, FaEye, FaPlay } from 'react-icons/fa6';
import './styles.scss';
import {
  CHANNELS,
  Capture,
  ChannelKey,
  DIVS_X,
  DIVS_Y,
  Direction,
  PRE_DIVS,
  TIMEBASES,
  autoTimebase,
  capture,
  valueAt,
} from './signals';

const W = 1000;
const H = 640;
const DX = W / DIVS_X;
const DY = H / DIVS_Y;

type CursorId = 0 | 1;

interface Verdict {
  tone: 'good' | 'ok' | 'bad';
  title: string;
  text: string;
}

const fmt = (v: number, digits: number) => v.toFixed(digits).replace('.', ',').replace('-', '−');

const xOf = (cap: Capture, t: number) => ((t - cap.t0) / (cap.tb * DIVS_X)) * W;
const yOf = (key: ChannelKey, v: number) => {
  const ch = CHANNELS.find((c) => c.key === key)!;
  return H - (ch.zeroDiv + v / ch.perDiv) * DY;
};

const tracePath = (cap: Capture, key: ChannelKey) => {
  const arr = cap.data[key];
  let d = '';
  for (let i = 0; i < arr.length; i++) {
    const x = (i / (arr.length - 1)) * W;
    const y = Math.max(-4, Math.min(H + 4, yOf(key, arr[i])));
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
};

const judge = (cap: Capture, t1: number, t2: number): Verdict => {
  const what = cap.dir === 'forward' ? '90% хода' : '10% хода (обратный ход)';
  const measured = t2 - t1;
  const tol = cap.tb * 0.04;
  if (measured <= 0) {
    return { tone: 'bad', title: 'Курсоры перепутаны', text: 'T1 ставится на момент команды, T2 — правее, на порог хода.' };
  }
  if (Math.abs(t1) > tol * 2) {
    return {
      tone: 'bad',
      title: 'T1 не на фронте команды',
      text: `Отсчёт ведётся от t0 — момента, когда скачком меняется жёлтый луч CH1. Сейчас T1 смещён на ${fmt(t1, 2)} мс.`,
    };
  }
  const err = measured - cap.target;
  const rel = Math.abs(err) / cap.target;
  if (rel <= 0.02) {
    return {
      tone: 'good',
      title: `Точно: tср = ${fmt(measured, 2)} мс`,
      text: `Эталон ${fmt(cap.target, 2)} мс, погрешность ${fmt(rel * 100, 1)}% — в пределах шума датчика положения.`,
    };
  }
  if (rel <= 0.06) {
    return {
      tone: 'ok',
      title: `Близко: ${fmt(measured, 2)} мс`,
      text: `Эталон ${fmt(cap.target, 2)} мс, ошибка ${fmt(err, 2)} мс (${fmt(rel * 100, 1)}%). Подведите T2 точнее к уровню ${what} на голубом луче CH4.`,
    };
  }
  return {
    tone: 'bad',
    title: `Мимо: ${fmt(measured, 2)} мс`,
    text: `Ошибка ${fmt(err, 2)} мс. T2 должен стоять там, где голубой луч CH4 пересекает уровень ${what}, а не на начале движения или упоре.`,
  };
};

export const Oscilloscope: FC = () => {
  const [dir, setDir] = useState<Direction>('forward');
  const [tb, setTb] = useState(() => autoTimebase('forward'));
  const [noisy, setNoisy] = useState(true);
  const [visible, setVisible] = useState<Record<ChannelKey, boolean>>({ cmd: true, cur: true, pil: true, pos: true });
  const [cursors, setCursors] = useState<[number, number]>(() => [autoTimebase('forward') * 1.6, autoTimebase('forward') * 5.2]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [solved, setSolved] = useState(false);
  const [sweep, setSweep] = useState(0);
  const [active, setActive] = useState<CursorId | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const cap = useMemo(() => capture(dir, tb, noisy), [dir, tb, noisy]);
  const paths = useMemo(
    () => (cap ? CHANNELS.reduce((acc, ch) => ({ ...acc, [ch.key]: tracePath(cap, ch.key) }), {} as Record<ChannelKey, string>) : null),
    [cap]
  );

  if (!cap || !paths) {
    return <p className='muted'>Модель не дала переключения при параметрах по умолчанию — осциллограмму построить нельзя.</p>;
  }

  const tMin = cap.t0;
  const tMax = cap.t0 + cap.tb * DIVS_X;
  const clampT = (t: number) => Math.min(tMax, Math.max(tMin, t));
  const [t1, t2] = cursors;

  const resetResult = () => {
    setVerdict(null);
    setSolved(false);
  };

  const restartSweep = () => setSweep((s) => s + 1);

  const changeDir = (next: Direction) => {
    if (next === dir) return;
    const nextTb = autoTimebase(next);
    setDir(next);
    setTb(nextTb);
    setCursors([nextTb * 1.6, nextTb * 5.2]);
    resetResult();
    restartSweep();
  };

  const changeTb = (next: number) => {
    setTb(next);
    const lo = -PRE_DIVS * next;
    const hi = lo + next * DIVS_X;
    setCursors(([a, b]) => [Math.min(hi, Math.max(lo, a)), Math.min(hi, Math.max(lo, b))]);
    restartSweep();
  };

  const timeFromClient = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return clampT(tMin + ((clientX - rect.left) / rect.width) * (tMax - tMin));
  };

  const moveCursor = (id: CursorId, t: number) => {
    setCursors((prev) => {
      const next: [number, number] = [prev[0], prev[1]];
      next[id] = clampT(t);
      return next;
    });
    resetResult();
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const t = timeFromClient(e.clientX);
    const id: CursorId = Math.abs(t - t1) <= Math.abs(t - t2) ? 0 : 1;
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(id);
    moveCursor(id, t);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (active === null || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    moveCursor(active, timeFromClient(e.clientX));
  };

  const onPointerUp = () => setActive(null);

  const onCursorKey = (id: CursorId) => (e: ReactKeyboardEvent<SVGGElement>) => {
    const step = (cap.tb / 50) * (e.shiftKey ? 10 : 1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveCursor(id, cursors[id] + step);
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveCursor(id, cursors[id] - step);
    }
  };

  const showSolution = () => {
    setCursors([0, cap.target]);
    setSolved(true);
    setVerdict({
      tone: 'good',
      title: `Эталон: tср = ${fmt(cap.target, 2)} мс`,
      text:
        cap.dir === 'forward'
          ? `T1 — фронт команды (t0). T2 — момент, когда ход золотника достиг 90%. Из них ${fmt(cap.sim.tDelay, 2)} мс уходит на задержку (ток, якорь, наполнение камеры) и только остальное — на само движение.`
          : `T1 — спад команды (t0). T2 — ход вернулся к 10%. Обратный ход медленнее: ток спадает дольше, а камеру нужно стравить, пока пружина не пересилит давление.`,
    });
  };

  const levelY = yOf('pos', cap.level);
  const targetX = xOf(cap, cap.target);
  const trigX = xOf(cap, 0);

  return (
    <div className='osc'>
      <div className='osc__scope'>
        <div className='osc__bezel'>
          <div className='osc__topline'>
            <span className='osc__run'>ОДНОКР.</span>
            <span>
              H <b>{cap.tb} мс/дел</b>
            </span>
            <span>
              Trig CH1 <b>{dir === 'forward' ? '↑' : '↓'} 12 В</b>
            </span>
            <span className='osc__model'>модель · {dir === 'forward' ? 'прямой ход' : 'обратный ход'}</span>
          </div>

          <svg
            ref={svgRef}
            className={`osc__screen ${active !== null ? 'is-dragging' : ''}`}
            viewBox={`0 0 ${W} ${H}`}
            role='img'
            aria-label='Экран осциллографа: команда, ток катушки, давление в камере управления и ход золотника'
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <radialGradient id='oscScreen' cx='50%' cy='45%' r='75%'>
                <stop offset='0' stopColor='#0c1420' />
                <stop offset='1' stopColor='#05070c' />
              </radialGradient>
              <filter id='oscGlow' x='-5%' y='-20%' width='110%' height='140%'>
                <feGaussianBlur stdDeviation='3.2' result='b' />
                <feMerge>
                  <feMergeNode in='b' />
                  <feMergeNode in='SourceGraphic' />
                </feMerge>
              </filter>
              <linearGradient id='oscBeam' x1='0' x2='1'>
                <stop offset='0' stopColor='#fff' stopOpacity='0' />
                <stop offset='1' stopColor='#fff' stopOpacity='.55' />
              </linearGradient>
              <clipPath id='oscSweepClip'>
                <rect key={sweep} x='0' y='0' width={W} height={H} className='osc__sweep-clip' />
              </clipPath>
            </defs>

            <rect width={W} height={H} fill='url(#oscScreen)' />

            {/* сетка */}
            <g className='osc__grid'>
              {Array.from({ length: DIVS_X + 1 }, (_, i) => (
                <line key={`v${i}`} x1={i * DX} y1='0' x2={i * DX} y2={H} />
              ))}
              {Array.from({ length: DIVS_Y + 1 }, (_, i) => (
                <line key={`h${i}`} x1='0' y1={i * DY} x2={W} y2={i * DY} />
              ))}
              {Array.from({ length: DIVS_X * 5 }, (_, i) => (
                <line key={`tx${i}`} x1={(i * DX) / 5} y1={H / 2 - 5} x2={(i * DX) / 5} y2={H / 2 + 5} className='minor' />
              ))}
              {Array.from({ length: DIVS_Y * 5 }, (_, i) => (
                <line key={`ty${i}`} x1={W / 2 - 5} y1={(i * DY) / 5} x2={W / 2 + 5} y2={(i * DY) / 5} className='minor' />
              ))}
            </g>

            {/* точка запуска */}
            <path d={`M${trigX - 9} 0 L${trigX + 9} 0 L${trigX} 13 Z`} className='osc__trig' />

            {/* нулевые уровни каналов */}
            {CHANNELS.filter((ch) => visible[ch.key]).map((ch) => {
              const y = H - ch.zeroDiv * DY;
              return (
                <g key={ch.key} className='osc__ground'>
                  <path d={`M0 ${y - 10} L16 ${y} L0 ${y + 10} Z`} fill={ch.color} />
                  <text x='3' y={y + 4} className='osc__ground-num'>{ch.num}</text>
                </g>
              );
            })}

            {/* подсказка-решение: уровень порога и точка пересечения */}
            {solved && (
              <g className='osc__solution'>
                <line x1='0' y1={levelY} x2={W} y2={levelY} />
                <text x={W - 10} y={levelY - 8} textAnchor='end'>{cap.level}% хода</text>
                <circle cx={targetX} cy={levelY} r='9' />
              </g>
            )}

            {/* лучи */}
            <g clipPath='url(#oscSweepClip)'>
              {CHANNELS.filter((ch) => visible[ch.key]).map((ch) => (
                <path key={ch.key} d={paths[ch.key]} className='osc__trace' stroke={ch.color} filter='url(#oscGlow)' />
              ))}
            </g>
            <rect key={`beam${sweep}`} x={-60} y='0' width='60' height={H} fill='url(#oscBeam)' className='osc__beam' />

            {/* курсоры */}
            {([0, 1] as CursorId[]).map((id) => {
              const x = xOf(cap, cursors[id]);
              return (
                <g
                  key={id}
                  className={`osc__cursor c${id + 1} ${active === id ? 'is-active' : ''}`}
                  tabIndex={0}
                  role='slider'
                  aria-label={`Курсор T${id + 1}`}
                  aria-valuemin={+tMin.toFixed(2)}
                  aria-valuemax={+tMax.toFixed(2)}
                  aria-valuenow={+cursors[id].toFixed(3)}
                  aria-valuetext={`${fmt(cursors[id], 2)} мс`}
                  onKeyDown={onCursorKey(id)}
                >
                  <line x1={x} y1='0' x2={x} y2={H} />
                  <rect x={x - 22} y={H - 30} width='44' height='24' rx='6' />
                  <text x={x} y={H - 13} textAnchor='middle'>T{id + 1}</text>
                </g>
              );
            })}
          </svg>

          <div className='osc__scales'>
            {CHANNELS.map((ch) => (
              <button
                key={ch.key}
                type='button'
                className={`osc__ch ${visible[ch.key] ? 'is-on' : ''}`}
                style={{ '--ch': ch.color } as CSSProperties}
                onClick={() => setVisible((v) => ({ ...v, [ch.key]: !v[ch.key] }))}
                aria-pressed={visible[ch.key]}
              >
                <b>{ch.num}</b>
                <span>{ch.name}</span>
                <em>
                  {ch.perDiv} {ch.unit}/дел
                </em>
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className='osc__panel'>
        <div className='osc__task'>
          <p className='kicker'>Задание</p>
          <p>
            Измерьте время срабатывания {dir === 'forward' ? 'прямого' : 'обратного'} хода: <b>T1</b> — на фронт
            команды, <b>T2</b> — где ход золотника {dir === 'forward' ? 'достигает 90%' : 'опускается до 10%'}.
            Курсоры перетаскиваются по экрану, точная подстройка — стрелками.
          </p>
          <div className='osc__seg' role='group' aria-label='Направление переключения'>
            <button type='button' className={dir === 'forward' ? 'on' : ''} onClick={() => changeDir('forward')}>
              прямой ход
            </button>
            <button type='button' className={dir === 'return' ? 'on' : ''} onClick={() => changeDir('return')}>
              обратный ход
            </button>
          </div>
        </div>

        <div className='osc__readout'>
          <div className='osc__delta'>
            <span>ΔT = T2 − T1</span>
            <b>
              {fmt(t2 - t1, 2)}
              <small> мс</small>
            </b>
          </div>
          <table>
            <thead>
              <tr>
                <th />
                <th>T1 · {fmt(t1, 2)}</th>
                <th>T2 · {fmt(t2, 2)}</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((ch) => (
                <tr key={ch.key} className={visible[ch.key] ? '' : 'is-off'}>
                  <td>
                    <i style={{ background: ch.color }} />
                    {ch.unit === '%' ? 'x' : ch.unit === 'бар' ? 'p' : ch.unit === 'мА' ? 'I' : 'U'}, {ch.unit}
                  </td>
                  <td>{fmt(valueAt(cap, ch.key, t1), ch.digits)}</td>
                  <td>{fmt(valueAt(cap, ch.key, t2), ch.digits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className='osc__actions'>
          <button type='button' className='btn btn-light btn-sm' onClick={() => setVerdict(judge(cap, t1, t2))}>
            <FaCheck /> Проверить
          </button>
          <button type='button' className='btn btn-ghost btn-sm' onClick={showSolution}>
            <FaEye /> Решение
          </button>
        </div>

        {verdict && (
          <div className={`osc__verdict is-${verdict.tone}`} aria-live='polite'>
            <b>{verdict.title}</b>
            <p>{verdict.text}</p>
          </div>
        )}

        <div className='osc__controls'>
          <div className='osc__row'>
            <span>Развёртка</span>
            <div className='osc__seg small' role='group' aria-label='Развёртка, мс на деление'>
              {TIMEBASES.map((v) => (
                <button key={v} type='button' className={tb === v ? 'on' : ''} onClick={() => changeTb(v)}>
                  {v} мс
                </button>
              ))}
            </div>
          </div>
          <div className='osc__row'>
            <span>Шум датчиков</span>
            <div className='osc__seg small' role='group' aria-label='Шум датчиков'>
              <button type='button' className={noisy ? 'on' : ''} onClick={() => { setNoisy(true); restartSweep(); }}>
                вкл
              </button>
              <button type='button' className={!noisy ? 'on' : ''} onClick={() => { setNoisy(false); restartSweep(); }}>
                выкл
              </button>
            </div>
          </div>
          <button type='button' className='osc__single' onClick={restartSweep}>
            <FaPlay /> Однократный запуск
          </button>
        </div>
      </aside>
    </div>
  );
};
