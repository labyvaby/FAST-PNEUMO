import {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FaPause, FaPlay, FaRotateLeft, FaXmark } from 'react-icons/fa6';
import './styles.scss';
import { Status } from '../../launchTypes';
import { useLaunchContext } from '../../useLaunchContext';
import {
  DEFAULT_PARAMS,
  SimPoint,
  SimResult,
  VALVE_CONST,
  simulate,
  simulateReturn,
} from '../../lib/valveModel';
import {
  BODY,
  BORE,
  COIL,
  CYL,
  FlowKey,
  LAND_W,
  LANDS0,
  OPEN_FORWARD_PCT,
  OPEN_RETURN_PCT,
  PARTICLES_PER_ROUTE,
  PILOT_VENT,
  PILOT_X,
  PIPES,
  PISTON_MAX,
  PISTON_MIN,
  PISTON_W,
  PLUNGER_TIP_CLOSED,
  PLUNGER_TIP_OPEN,
  PORTS,
  PORT_W,
  ROD_LEN,
  ROUTES,
  SHIFT,
  SILENCERS,
  clamp01,
  openings,
  springPath,
} from './geometry';

interface SchemeProps {
  isToggled: boolean;
  position: number;
  pressure: number;
  flow: number;
}

type Direction = 'forward' | 'return';

interface Dot {
  x: number;
  y: number;
  o: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
}

interface Frame {
  /** смещение золотника, px (0…SHIFT) */
  o: number;
  /** ток катушки, доля от установившегося */
  coil: number;
  coilA: number;
  armature: number;
  /** давление в пилотной камере, доля от питания */
  pilot: number;
  pilotBar: number;
  /** положение поршня цилиндра 0…1 */
  piston: number;
  pL: number;
  pR: number;
  flows: Record<FlowKey, number>;
  dots: Record<FlowKey, Dot[]>;
  puffs: Puff[];
}

interface ReplayEvent {
  t: number;
  title: string;
  text: string;
}

interface ReplayPlan {
  dir: Direction;
  sim: SimResult;
  tEnd: number;
  t90: number;
  tOpen: number;
  events: ReplayEvent[];
  phases: { from: number; to: number; key: string; label: string }[];
  slowdown: number;
}

const FLOW_KEYS: FlowKey[] = ['supply', 'pa', 'pb', 'as', 'br', 'pilotIn', 'pilotEx'];
const REPLAY_SCREEN_MS = 12000;
const U_R = DEFAULT_PARAMS.voltage / VALVE_CONST.coilResistanceOhm;
const TAU_MS = (VALVE_CONST.coilInductanceH / VALVE_CONST.coilResistanceOhm) * 1000;

const zeroFlows = (): Record<FlowKey, number> =>
  FLOW_KEYS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Record<FlowKey, number>);

const fmt = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

const sampleAt = (series: SimPoint[], t: number) => {
  if (series.length === 0) return { p: 0, x: 0 };
  if (t <= series[0].t) return series[0];
  let lo = 0;
  let hi = series.length - 1;
  if (t >= series[hi].t) return series[hi];
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

const crossing = (series: SimPoint[], level: number, rising: boolean) => {
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    if (rising ? a.x < level && b.x >= level : a.x > level && b.x <= level) {
      return a.t + ((level - a.x) / (b.x - a.x || 1)) * (b.t - a.t);
    }
  }
  return null;
};

const buildPlan = (dir: Direction): ReplayPlan | null => {
  const forward = dir === 'forward';
  const sim = forward ? simulate(DEFAULT_PARAMS) : simulateReturn(DEFAULT_PARAMS);
  if (!sim.ok) return null;
  const tOpenValve = sim.tCoil + sim.tArmature;
  const tChannel = crossing(sim.series, forward ? OPEN_FORWARD_PCT : OPEN_RETURN_PCT, forward) ?? sim.tTotal;
  const t90 = crossing(sim.series, forward ? 90 : 10, forward) ?? sim.tTotal;
  const tEnd = sim.tTotal + Math.max(1.5, sim.tTotal * 0.12);
  const ms = (v: number) => `${fmt(v, 2)} мс`;

  const events: ReplayEvent[] = forward
    ? [
        { t: 0, title: 'Команда', text: `На катушку пилота подано ${DEFAULT_PARAMS.voltage} В. Ток растёт не мгновенно — мешает индуктивность.` },
        { t: sim.tCoil, title: ms(sim.tCoil), text: `Ток достиг ${fmt(VALVE_CONST.pullInCurrentA, 2)} А — магнит пересилил пружину якоря, плунжер втягивается.` },
        { t: tOpenValve, title: ms(tOpenValve), text: 'Пилотный клапан открыт: воздух через канал Ø1 мм наполняет камеру управления.' },
        { t: sim.tDelay, title: ms(sim.tDelay), text: 'Сила давления превысила усилие пружины и трение покоя — золотник сдвинулся.' },
        { t: tChannel, title: ms(tChannel), text: 'Поясок перекрыл P→B и открыл P→A. Цилиндр получает воздух, полость B стравливается в R.' },
        { t: t90, title: ms(t90), text: `Пройдено 90% хода — по методике это и есть время срабатывания tср = ${ms(t90)}.` },
        { t: sim.tTotal, title: ms(sim.tTotal), text: `Золотник на упоре. Всё переключение заняло ${ms(sim.tTotal)} — быстрее моргания в 10 раз.` },
      ]
    : [
        { t: 0, title: 'Команда', text: 'Катушка обесточена. Ток спадает по экспоненте — магнитное поле не исчезает сразу.' },
        { t: sim.tCoil, title: ms(sim.tCoil), text: `Ток упал до тока отпускания ${fmt(VALVE_CONST.dropOutCurrentA, 2)} А — пружина возвращает плунжер.` },
        { t: tOpenValve, title: ms(tOpenValve), text: 'Пилот перекрыл подачу и открыл сброс: камера управления стравливается в атмосферу.' },
        { t: sim.tDelay, title: ms(sim.tDelay), text: 'Пружина пересилила остаточное давление и трение — золотник пошёл назад.' },
        { t: tChannel, title: ms(tChannel), text: 'Открыт P→B, полость A стравливается в S — цилиндр начинает обратный ход.' },
        { t: t90, title: ms(t90), text: `Золотник прошёл 90% обратного хода: tср = ${ms(t90)}.` },
        { t: sim.tTotal, title: ms(sim.tTotal), text: `Исходное положение. Обратный ход занял ${ms(sim.tTotal)}.` },
      ];

  return {
    dir,
    sim,
    tEnd,
    t90,
    tOpen: tChannel,
    events,
    phases: [
      { from: 0, to: sim.tCoil, key: 'coil', label: forward ? 'нарастание тока' : 'спад тока' },
      { from: sim.tCoil, to: tOpenValve, key: 'armature', label: 'якорь' },
      { from: tOpenValve, to: sim.tDelay, key: 'fill', label: forward ? 'наполнение камеры' : 'сброс камеры' },
      { from: sim.tDelay, to: sim.tTotal, key: 'move', label: 'ход золотника' },
    ],
    slowdown: REPLAY_SCREEN_MS / tEnd,
  };
};

/** Состояние повтора в момент t (мс модели). */
const replayState = (plan: ReplayPlan, t: number) => {
  const { sim } = plan;
  const forward = plan.dir === 'forward';
  const s = sampleAt(sim.series, t);
  const coil = forward ? 1 - Math.exp(-t / TAU_MS) : Math.exp(-t / TAU_MS);
  const armature = forward
    ? clamp01((t - sim.tCoil) / sim.tArmature)
    : 1 - clamp01((t - sim.tCoil) / sim.tArmature);
  return {
    o: (clamp01(s.x / 100) * SHIFT),
    coil,
    coilA: coil * U_R,
    armature,
    pilot: clamp01(s.p / DEFAULT_PARAMS.supplyBar),
    pilotBar: Math.max(0, s.p),
    x: s.x,
  };
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const Scheme: FC<SchemeProps> = ({ isToggled, position, pressure, flow }) => {
  const { status } = useLaunchContext();
  const isRunning = status === Status.STARTED;

  const [seconds, setSeconds] = useState(0);
  const [replayDir, setReplayDir] = useState<Direction | null>(null);
  const [replayT, setReplayT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const plans = useMemo(() => ({ forward: buildPlan('forward'), return: buildPlan('return') }), []);
  const plan = replayDir ? plans[replayDir] : null;

  const pathRefs = useRef<Partial<Record<FlowKey, SVGPathElement | null>>>({});
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const inputs = useRef({ isToggled, position, isRunning, plan, replayT, playing });
  inputs.current = { isToggled, position, isRunning, plan, replayT, playing };

  const sim = useRef({
    o: (position / 100) * SHIFT,
    coil: 0,
    armature: 0,
    pilot: 0,
    piston: 0,
    pL: 0,
    pR: 0,
    seeds: FLOW_KEYS.reduce(
      (acc, k) => ({
        ...acc,
        [k]: Array.from({ length: PARTICLES_PER_ROUTE[k] }, (_, i) => ({
          s: i / PARTICLES_PER_ROUTE[k] + Math.random() * 0.03,
          jx: (Math.random() - 0.5) * 3,
          jy: (Math.random() - 0.5) * 3,
          v: 0.85 + Math.random() * 0.3,
        })),
      }),
      {} as Record<FlowKey, { s: number; jx: number; jy: number; v: number }[]>
    ),
    puffs: [] as Puff[],
    quiet: false,
  });

  const [frame, setFrame] = useState<Frame>(() => ({
    o: (position / 100) * SHIFT,
    coil: 0,
    coilA: 0,
    armature: 0,
    pilot: 0,
    pilotBar: 0,
    piston: 0,
    pL: 0,
    pR: 0,
    flows: zeroFlows(),
    dots: FLOW_KEYS.reduce((acc, k) => ({ ...acc, [k]: [] }), {} as Record<FlowKey, Dot[]>),
    puffs: [],
  }));

  // секундомер запуска
  useEffect(() => {
    if (!isRunning) {
      setSeconds(0);
      return undefined;
    }
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // главный цикл: физика живого режима, повтор, частицы
  useEffect(() => {
    const reduced = prefersReducedMotion();
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // время повтора идёт по реальным часам (даже при просадке кадров), физика — с ограниченным шагом
      const realDt = Math.min(0.25, (now - last) / 1000);
      const dt = Math.min(0.05, realDt);
      last = now;
      const st = sim.current;
      const inp = inputs.current;
      const replay = inp.plan;

      // в повторе состояние живого режима не трогаем — после выхода стенд продолжит как был
      let o: number;
      let coil: number;
      let armature: number;
      let pilot: number;
      let piston: number;
      let pL: number;
      let pR: number;
      let coilA: number;
      let pilotBar: number;
      let flows = zeroFlows();
      let slow = 1;

      if (replay) {
        let t = inp.replayT;
        if (inp.playing) {
          t = Math.min(replay.tEnd, t + (realDt * 1000) / replay.slowdown);
          if (t !== inp.replayT) setReplayT(t);
          if (t >= replay.tEnd) setPlaying(false);
        }
        const r = replayState(replay, t);
        o = r.o;
        coil = r.coil;
        armature = r.armature;
        pilot = r.pilot;
        coilA = r.coilA;
        pilotBar = r.pilotBar;
        const fwd = replay.dir === 'forward';
        // за десятки миллисекунд цилиндр сдвинуться не успевает: полости в исходном состоянии
        piston = fwd ? 0 : 1;
        pL = fwd ? 0.02 : 1;
        pR = fwd ? 1 : 0.02;
        const op = openings(o);
        const opening = t >= replay.sim.tCoil + replay.sim.tArmature;
        // течёт только туда, где есть перепад: в пустую полость и из полной в атмосферу
        const pa = op.pa * (fwd ? 1 : 0.06);
        const pb = op.pb * (fwd ? 0.06 : 1);
        flows = {
          supply: 0.25 + 0.75 * Math.max(pa, pb),
          pa,
          pb,
          as: op.as * (fwd ? 0.06 : 0.9),
          br: op.br * (fwd ? 0.9 : 0.06),
          pilotIn: fwd && opening ? clamp01(1.4 - r.pilot) : 0,
          pilotEx: !fwd && opening ? clamp01(r.pilot * 1.6 + 0.1) : 0,
        };
        slow = 0.22;
      } else {
        const running = inp.isRunning;
        const targetO = (clamp01(inp.position / 100)) * SHIFT;
        st.o += (targetO - st.o) * (1 - Math.exp(-dt / 0.06));
        o = st.o;
        const energized = running && inp.isToggled;
        st.coil += ((energized ? 1 : 0) - st.coil) * (1 - Math.exp(-dt / 0.05));
        if (st.coil > 0.6) st.armature += (1 - st.armature) * (1 - Math.exp(-dt / 0.02));
        if (st.coil < 0.27) st.armature += (0 - st.armature) * (1 - Math.exp(-dt / 0.02));
        const pilotOpen = st.armature > 0.5;
        st.pilot += ((pilotOpen ? 1 : 0) - st.pilot) * (1 - Math.exp(-dt / 0.07));
        coilA = st.coil * U_R;
        pilotBar = st.pilot * DEFAULT_PARAMS.supplyBar;

        const op = openings(o);
        const sup = running ? 1 : 0;
        // наполнение / стравливание полостей цилиндра пропорционально открытию каналов
        st.pL = clamp01(st.pL + (op.pa * sup * (1 - st.pL) * 7 - op.as * st.pL * 5) * dt);
        st.pR = clamp01(st.pR + (op.pb * sup * (1 - st.pR) * 7 - op.br * st.pR * 5) * dt);
        const drive = st.pL - st.pR;
        const vel = Math.abs(drive) > 0.08 ? Math.sign(drive) * Math.min(1, Math.abs(drive)) * 1.5 : 0;
        const prevPiston = st.piston;
        st.piston = clamp01(st.piston + vel * dt);
        const moving = Math.abs(st.piston - prevPiston) > 1e-5;
        const movingFwd = moving && st.piston > prevPiston;
        const movingBack = moving && st.piston < prevPiston;

        flows = {
          supply: 0,
          pa: sup * op.pa * Math.max(1 - st.pL, movingFwd ? 0.75 : 0),
          pb: sup * op.pb * Math.max(1 - st.pR, movingBack ? 0.75 : 0),
          as: op.as * Math.max(st.pL * 0.9, movingBack ? 0.6 : 0),
          br: op.br * Math.max(st.pR * 0.9, movingFwd ? 0.6 : 0),
          pilotIn: sup * (pilotOpen ? clamp01((1 - st.pilot) * 1.6) : 0),
          pilotEx: !pilotOpen ? clamp01(st.pilot * 1.6) : 0,
        };
        flows.supply = sup * clamp01(0.18 + flows.pa + flows.pb + flows.pilotIn * 0.4);
        coil = st.coil;
        armature = st.armature;
        pilot = st.pilot;
        piston = st.piston;
        pL = st.pL;
        pR = st.pR;
      }

      // частицы
      const dots = {} as Record<FlowKey, Dot[]>;
      for (const key of FLOW_KEYS) {
        const path = pathRefs.current[key];
        const intensity = reduced ? 0 : flows[key];
        const list: Dot[] = [];
        if (path && intensity > 0.02) {
          const len = path.getTotalLength();
          const speed = (190 + 260 * intensity) * slow;
          for (const p of st.seeds[key]) {
            p.s = (p.s + (speed * p.v * dt) / len) % 1;
            const pt = path.getPointAtLength(p.s * len);
            const edgeFade = Math.min(1, p.s * 12, (1 - p.s) * 8);
            list.push({ x: pt.x + p.jx, y: pt.y + p.jy, o: Math.min(1, intensity * 1.6) * edgeFade });
          }
        }
        dots[key] = list;
      }

      // клубы выхлопа
      if (!reduced) {
        const vents: { x: number; y: number; k: number; dy: number }[] = [
          { x: SILENCERS[0].x, y: SILENCERS[0].y + 16, k: flows.as, dy: 1 },
          { x: SILENCERS[1].x, y: SILENCERS[1].y + 16, k: flows.br, dy: 1 },
          { x: PILOT_VENT.x, y: PILOT_VENT.y - 4, k: flows.pilotEx, dy: -1 },
        ];
        for (const v of vents) {
          if (v.k > 0.05 && Math.random() < v.k * dt * 40 * slow) {
            st.puffs.push({
              x: v.x + (Math.random() - 0.5) * 8,
              y: v.y,
              vx: (Math.random() - 0.5) * 50,
              vy: v.dy * (20 + Math.random() * 35),
              life: 1,
              r: 3 + Math.random() * 3,
            });
          }
        }
      }
      st.puffs = st.puffs
        .map((p) => ({
          ...p,
          x: p.x + p.vx * dt * slow,
          y: p.y + p.vy * dt * slow,
          r: Math.min(14, p.r + 12 * dt * slow),
          life: p.life - 0.9 * dt * Math.max(slow, 0.5),
        }))
        .filter((p) => p.life > 0)
        .slice(-60);

      const anyFlow = FLOW_KEYS.some((k) => flows[k] > 0.02);
      const settled =
        !replay &&
        !anyFlow &&
        st.puffs.length === 0 &&
        Math.abs((clamp01(inp.position / 100)) * SHIFT - st.o) < 0.05 &&
        st.coil < 0.001 &&
        st.pilot < 0.001;

      if (!settled || !st.quiet) {
        setFrame({
          o,
          coil,
          coilA,
          armature,
          pilot,
          pilotBar,
          piston,
          pL,
          pR,
          flows,
          dots,
          puffs: st.puffs,
        });
      }
      st.quiet = settled;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const startReplay = (dir: Direction) => {
    if (!plans[dir]) return;
    setReplayDir(dir);
    setReplayT(0);
    setPlaying(true);
  };

  const exitReplay = () => {
    setReplayDir(null);
    setPlaying(false);
  };

  const scrubTo = (clientX: number) => {
    const el = timelineRef.current;
    if (!el || !plan) return;
    const rect = el.getBoundingClientRect();
    const k = clamp01((clientX - rect.left) / rect.width);
    setReplayT(k * plan.tEnd);
  };

  const onScrubStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
    scrubTo(e.clientX);
  };

  const onScrubMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubTo(e.clientX);
  };

  const onTimelineKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!plan) return;
    const step = plan.tEnd / 100;
    if (e.key === 'ArrowRight') setReplayT((t) => Math.min(plan.tEnd, t + step));
    if (e.key === 'ArrowLeft') setReplayT((t) => Math.max(0, t - step));
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying((p) => !p);
    }
  };

  // ---------- производные значения для отрисовки ----------
  const f = frame;
  const op = openings(f.o);
  const lands = LANDS0.map((c) => c + f.o);
  const pistonX = PISTON_MIN + f.piston * (PISTON_MAX - PISTON_MIN);
  const springStart = lands[2] + LAND_W / 2 + 6;
  const plungerTip = PLUNGER_TIP_CLOSED + (PLUNGER_TIP_OPEN - PLUNGER_TIP_CLOSED) * f.armature;
  const live = !plan;
  const forwardActive = f.o > SHIFT / 2;
  const groove1 = clamp01(op.pa + (1 - op.pa) * f.pL * (1 - op.as));
  const groove2 = clamp01(op.pb + (1 - op.pb) * f.pR * (1 - op.br));
  const supplyOn = live ? isRunning : true;
  const heat = (p: number) => 0.06 + 0.55 * p;

  const currentEvent = plan
    ? [...plan.events].reverse().find((ev) => ev.t <= replayT + 1e-6) ?? plan.events[0]
    : null;
  const replayX = plan ? replayState(plan, replayT).x : 0;

  const lineColor = (feed: number, exhaust: number) =>
    feed > 0.02 ? 'is-feed' : exhaust > 0.02 ? 'is-exhaust' : '';

  return (
    <div className={`mechanism ${plan ? 'is-replay' : ''}`}>
      <div className='mechanism__bar'>
        <div className='mechanism__status'>
          <span className={`mechanism__lamp ${plan ? 'is-rec' : isRunning ? 'is-on' : ''}`} />
          <div>
            <b>
              {plan
                ? `Замедленный повтор · ×${Math.round(plan.slowdown)}`
                : isRunning
                  ? 'Пневмолиния под давлением'
                  : 'Питание перекрыто'}
            </b>
            <span>
              {plan
                ? plan.dir === 'forward'
                  ? 'Прямой ход: катушка включена'
                  : 'Обратный ход: катушка обесточена'
                : forwardActive
                  ? 'Активно: P→A, выхлоп B→R'
                  : 'Активно: P→B, выхлоп A→S'}
            </span>
          </div>
        </div>

        <div className='mechanism__actions'>
          {plan ? (
            <>
              <button
                type='button'
                className='mech-btn'
                onClick={() => {
                  if (replayT >= plan.tEnd) setReplayT(0);
                  setPlaying((p) => !p);
                }}
                aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              >
                {playing ? <FaPause /> : <FaPlay />}
              </button>
              <button
                type='button'
                className='mech-btn'
                onClick={() => {
                  setReplayT(0);
                  setPlaying(true);
                }}
                aria-label='С начала'
              >
                <FaRotateLeft />
              </button>
              <div className='mech-seg' role='group' aria-label='Направление'>
                <button
                  type='button'
                  className={plan.dir === 'forward' ? 'on' : ''}
                  onClick={() => startReplay('forward')}
                >
                  прямой
                </button>
                <button
                  type='button'
                  className={plan.dir === 'return' ? 'on' : ''}
                  onClick={() => startReplay('return')}
                  disabled={!plans.return}
                >
                  обратный
                </button>
              </div>
              <button type='button' className='mech-btn' onClick={exitReplay} aria-label='Вернуться к стенду'>
                <FaXmark />
              </button>
            </>
          ) : (
            <button
              type='button'
              className='mech-cta'
              onClick={() => startReplay(isToggled ? 'forward' : 'return')}
              disabled={!plans.forward}
              title='Переключение длится миллисекунды — посмотрите его в замедлении'
            >
              <FaPlay />
              <span>Замедлить переключение</span>
            </button>
          )}
        </div>
      </div>

      <svg
        className={`mechanism__svg ${supplyOn ? 'is-running' : 'is-idle'}`}
        viewBox='0 0 960 520'
        role='img'
        aria-label='Разрез пневматического золотникового распределителя 5/2 с цилиндром'
      >
        <defs>
          <linearGradient id='mechSteel' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0' stopColor='#e6edf5' />
            <stop offset='.45' stopColor='#8e9bb0' />
            <stop offset='.55' stopColor='#6f7b8f' />
            <stop offset='1' stopColor='#c9d3df' />
          </linearGradient>
          <linearGradient id='mechBody' x1='0' x2='0' y1='0' y2='1'>
            <stop offset='0' stopColor='#171a2b' />
            <stop offset='1' stopColor='#0d0f1b' />
          </linearGradient>
          <pattern id='mechHatch' width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
            <line x1='0' y1='0' x2='0' y2='8' className='hatch-line' />
          </pattern>
          <radialGradient id='mechCoilGlow'>
            <stop offset='0' stopColor='#F2B43C' stopOpacity='.55' />
            <stop offset='1' stopColor='#F2B43C' stopOpacity='0' />
          </radialGradient>
          <filter id='mechGlow' x='-50%' y='-50%' width='200%' height='200%'>
            <feGaussianBlur stdDeviation='2.2' result='b' />
            <feMerge>
              <feMergeNode in='b' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
          <clipPath id='mechBoreClip'>
            <rect x={BORE.x0} y={BORE.y0} width={BORE.x1 - BORE.x0} height={BORE.y1 - BORE.y0} rx='4' />
          </clipPath>
        </defs>

        {/* сетка-подложка */}
        <rect x='8' y='8' width='944' height='504' rx='18' className='panel' />

        {/* ---------- трубопроводы ---------- */}
        <g className='pipes'>
          {Object.entries(PIPES).map(([k, d]) => (
            <path key={k} d={d} className='pipe-bed' />
          ))}
          <path d={PIPES.main} className={`pipe-live ${supplyOn ? 'is-feed' : ''}`} />
          <path d={PIPES.pilotSupply} className={`pipe-live pilot ${f.pilot > 0.02 || f.flows.pilotIn > 0.02 ? 'is-pilot' : ''}`} style={{ opacity: 0.25 + 0.75 * Math.max(f.pilot, f.flows.pilotIn) }} />
          <path d={PIPES.pilotJoin} className={`pipe-live pilot ${f.pilot > 0.02 ? 'is-pilot' : ''}`} style={{ opacity: 0.25 + 0.75 * f.pilot }} />
          <path d={PIPES.pilotVent} className={`pipe-live ${f.flows.pilotEx > 0.02 ? 'is-exhaust' : ''}`} />
          <path d={PIPES.lineA} className={`pipe-live ${lineColor(op.pa * (supplyOn ? 1 : 0), op.as * f.pL + f.flows.as)}`} style={{ opacity: 0.35 + 0.65 * Math.max(f.pL, op.pa) }} />
          <path d={PIPES.lineB} className={`pipe-live ${lineColor(op.pb * (supplyOn ? 1 : 0), op.br * f.pR + f.flows.br)}`} style={{ opacity: 0.35 + 0.65 * Math.max(f.pR, op.pb) }} />
          <path d={PIPES.exhaustS} className={`pipe-live ${f.flows.as > 0.02 ? 'is-exhaust' : ''}`} />
          <path d={PIPES.exhaustR} className={`pipe-live ${f.flows.br > 0.02 ? 'is-exhaust' : ''}`} />
        </g>

        {/* невидимые маршруты частиц */}
        {FLOW_KEYS.map((k) => (
          <path
            key={k}
            d={ROUTES[k]}
            ref={(el) => {
              pathRefs.current[k] = el;
            }}
            fill='none'
            stroke='none'
          />
        ))}

        {/* ---------- цилиндр ---------- */}
        <g className='cyl'>
          <title>Исполнительный цилиндр двустороннего действия</title>
          <text x={CYL.x0} y={CYL.y0 - 12} className='cap'>Цилиндр · полости A и B</text>
          <rect x={CYL.x0} y={CYL.y0} width={CYL.x1 - CYL.x0} height={CYL.y1 - CYL.y0} rx='12' className='cyl-body' />
          <rect
            x={CYL.x0 + 4}
            y={CYL.y0 + 4}
            width={Math.max(0, pistonX - CYL.x0 - 4)}
            height={CYL.y1 - CYL.y0 - 8}
            rx='9'
            className='chamber'
            style={{ fillOpacity: heat(f.pL) }}
          />
          <rect
            x={pistonX + PISTON_W}
            y={CYL.y0 + 4}
            width={Math.max(0, CYL.x1 - 4 - pistonX - PISTON_W)}
            height={CYL.y1 - CYL.y0 - 8}
            rx='9'
            className='chamber'
            style={{ fillOpacity: heat(f.pR) }}
          />
          <rect x={pistonX + PISTON_W} y={CYL.cy - 6} width={ROD_LEN} height='12' rx='3' className='rod' />
          <circle cx={pistonX + PISTON_W + ROD_LEN + 9} cy={CYL.cy} r='11' className='rod-eye' />
          <circle cx={pistonX + PISTON_W + ROD_LEN + 9} cy={CYL.cy} r='4' className='rod-eye-hole' />
          <rect x={pistonX} y={CYL.y0 + 6} width={PISTON_W} height={CYL.y1 - CYL.y0 - 12} rx='5' className='piston' />
          <rect x={CYL.x1 - 2} y={CYL.cy - 11} width='14' height='22' rx='3' className='cyl-cap' />
          <text x={CYL.x1 + 40} y={CYL.y1 + 4} className='cap'>шток · {fmt(f.piston * 100, 0)}%</text>
          <text x={CYL.x0 + 14} y={CYL.cy + 5} className='port-tag'>A</text>
          <text x={CYL.x1 - 26} y={CYL.cy + 5} className='port-tag'>B</text>
        </g>

        {/* ---------- корпус распределителя (разрез) ---------- */}
        <g className='valve'>
          <title>Золотниковый распределитель 5/2 в разрезе</title>
          <rect x={BODY.x} y={BODY.y} width={BODY.w} height={BODY.h} rx='14' className='valve-body' />
          <rect x={BODY.x} y={BODY.y} width={BODY.w} height={BODY.h} rx='14' fill='url(#mechHatch)' className='valve-hatch' />

          {/* окна портов */}
          {(['A', 'B'] as const).map((k) => (
            <rect key={k} x={PORTS[k] - PORT_W / 2} y={BODY.y - 1} width={PORT_W} height={BORE.y0 - BODY.y + 2} className='port-hole' />
          ))}
          {(['S', 'P', 'R'] as const).map((k) => (
            <rect key={k} x={PORTS[k] - PORT_W / 2} y={BORE.y1 - 1} width={PORT_W} height={BODY.y + BODY.h - BORE.y1 + 2} className='port-hole' />
          ))}
          <rect x={PORTS.P - PORT_W / 2} y={BORE.y1 - 1} width={PORT_W} height={BODY.y + BODY.h - BORE.y1 + 2} className='port-fill' style={{ fillOpacity: supplyOn ? heat(1) : 0 }} />

          {/* гильза */}
          <rect x={BORE.x0} y={BORE.y0} width={BORE.x1 - BORE.x0} height={BORE.y1 - BORE.y0} rx='4' className='bore' />

          <g clipPath='url(#mechBoreClip)'>
            {/* пилотная камера */}
            <rect x={BORE.x0} y={BORE.y0} width={Math.max(0, lands[0] - LAND_W / 2 - BORE.x0)} height={BORE.y1 - BORE.y0} className='pilot-chamber' style={{ fillOpacity: 0.05 + 0.7 * f.pilot }} />
            {/* канавки между поясками */}
            <rect x={lands[0] + LAND_W / 2} y={BORE.y0} width={lands[1] - lands[0] - LAND_W} height={BORE.y1 - BORE.y0} className='groove' style={{ fillOpacity: heat(supplyOn ? groove1 : f.pL) }} />
            <rect x={lands[1] + LAND_W / 2} y={BORE.y0} width={lands[2] - lands[1] - LAND_W} height={BORE.y1 - BORE.y0} className='groove' style={{ fillOpacity: heat(supplyOn ? groove2 : f.pR) }} />
            {/* пружина */}
            <path d={springPath(springStart, BORE.x1 - 2)} className='spring' />
            {/* шток и пояски */}
            <rect x={lands[0] - LAND_W / 2} y={BORE.cy - 6} width={lands[2] - lands[0] + LAND_W + 6} height='12' className='stem' />
            {lands.map((c, i) => (
              <g key={i}>
                <rect x={c - LAND_W / 2} y={BORE.y0 + 1} width={LAND_W} height={BORE.y1 - BORE.y0 - 2} rx='3' className='land' />
                <line x1={c - LAND_W / 2 + 9} y1={BORE.y0 + 1} x2={c - LAND_W / 2 + 9} y2={BORE.y1 - 1} className='seal' />
                <line x1={c + LAND_W / 2 - 9} y1={BORE.y0 + 1} x2={c + LAND_W / 2 - 9} y2={BORE.y1 - 1} className='seal' />
              </g>
            ))}
            <rect x={springStart - 6} y={BORE.y0 + 6} width='6' height={BORE.y1 - BORE.y0 - 12} className='land' />
          </g>

          {/* подписи портов */}
          <text x={PORTS.A + 28} y={BODY.y - 10} className='port-letter'>A</text>
          <text x={PORTS.B + 28} y={BODY.y - 10} className='port-letter'>B</text>
          <text x={PORTS.S - 28} y={BODY.y + BODY.h + 22} className='port-letter'>S</text>
          <text x={PORTS.P + 28} y={BODY.y + BODY.h + 22} className='port-letter'>P</text>
          <text x={PORTS.R + 28} y={BODY.y + BODY.h + 22} className='port-letter'>R</text>
          <text x={BODY.x + BODY.w} y={BODY.y - 10} className='cap end'>пружина возврата</text>
          <text x={BODY.x + 12} y={BODY.y + 22} className='cap spool-cap'>золотник {fmt((f.o / SHIFT) * 100, 0)}%</text>
        </g>

        {/* ---------- пилот: катушка и плунжер ---------- */}
        <g className='pilot'>
          <title>Электромагнитный пилот Y1</title>
          <circle cx={COIL.x + COIL.w / 2} cy={COIL.y + COIL.h / 2} r={70} fill='url(#mechCoilGlow)' style={{ opacity: f.coil }} />
          {[0, 1, 2].map((i) => (
            <ellipse
              key={i}
              cx={COIL.x + COIL.w / 2}
              cy={COIL.y + COIL.h / 2}
              rx={COIL.w / 2 + 10 + i * 9}
              ry={COIL.h / 2 + 6 + i * 7}
              className='field'
              style={{ opacity: f.coil * (0.7 - i * 0.18) }}
            />
          ))}
          <rect x={plungerTip - 64} y={COIL.y + COIL.h / 2 - 7} width='64' height='14' rx='3' className='plunger' />
          <rect x={COIL.x} y={COIL.y} width={COIL.w} height={COIL.h} rx='8' className='coil' />
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={i}
              x1={COIL.x + 10 + i * 6.8}
              y1={COIL.y + 6}
              x2={COIL.x + 10 + i * 6.8}
              y2={COIL.y + COIL.h - 6}
              className='winding'
              style={{ strokeOpacity: 0.25 + 0.75 * f.coil }}
            />
          ))}
          <text x={COIL.x} y={COIL.y + COIL.h + 20} className='cap'>пилот Y1</text>
          <text x={COIL.x} y={COIL.y + COIL.h + 38} className='cap amber'>{fmt(f.coilA * 1000, 0)} мА</text>
          <text x={PILOT_X + 10} y={PILOT_VENT.y + 6} className='cap'>сброс</text>
        </g>

        {/* ---------- компрессор и фильтр ---------- */}
        <g className='source'>
          <rect x='40' y='404' width='102' height='72' rx='12' className='box' />
          <circle cx='91' cy='440' r='22' className={`fan ${supplyOn ? 'spin' : ''}`} />
          <path d='M83 440 L101 430 L101 450 Z' className='fan-mark' />
          <text x='40' y='498' className='cap'>компрессор</text>
          <rect x='162' y='416' width='52' height='48' rx='9' className='box' />
          <path d='M170 430 H206 M170 440 H206 M170 450 H206' className='filter-lines' />
          <text x='160' y='498' className='cap'>фильтр</text>
        </g>

        {/* глушители */}
        {SILENCERS.map((s, i) => (
          <g key={i} className='silencer'>
            <rect x={s.x - 10} y={s.y} width='20' height='16' rx='4' />
            <path d={`M${s.x - 6} ${s.y + 4} V${s.y + 12} M${s.x} ${s.y + 4} V${s.y + 12} M${s.x + 6} ${s.y + 4} V${s.y + 12}`} />
          </g>
        ))}

        {/* ---------- частицы ---------- */}
        <g className='particles' filter='url(#mechGlow)'>
          {FLOW_KEYS.map((k) =>
            f.dots[k].map((d, i) => (
              <circle
                key={`${k}${i}`}
                cx={d.x}
                cy={d.y}
                r={k === 'supply' ? 2.4 : 2.7}
                className={`dot dot-${k === 'as' || k === 'br' || k === 'pilotEx' ? 'ex' : k.startsWith('pilot') ? 'pilot' : 'feed'}`}
                opacity={d.o}
              />
            ))
          )}
          {f.puffs.map((p, i) => (
            <circle key={`p${i}`} cx={p.x} cy={p.y} r={p.r} className='puff' opacity={p.life * 0.3} />
          ))}
        </g>

        {/* ---------- табло ---------- */}
        <g className='hud' transform='translate(706 352)'>
          <rect width='226' height='140' rx='14' className='hud-bg' />
          {(plan
            ? [
                ['t', `${fmt(replayT, 2)} мс`],
                ['ток', `${fmt(f.coilA * 1000, 0)} мА`],
                ['p упр.', `${fmt(f.pilotBar, 2)} бар`],
                ['ход', `${fmt(replayX, 1)} %`],
              ]
            : [
                ['p пит.', `${pressure.toFixed(0)} кПа`],
                ['ход', `${position.toFixed(1)} %`],
                ['расход', `${flow.toFixed(2)} м³/ч`],
                ['время', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`],
              ]
          ).map(([k, v], i) => (
            <g key={k} transform={`translate(18 ${30 + i * 28})`}>
              <text className='hud-k'>{k}</text>
              <text x='190' className='hud-v' textAnchor='end'>{v}</text>
            </g>
          ))}
        </g>

        {plan && (
          <g className='rec'>
            <rect x='22' y='22' width='132' height='30' rx='15' />
            <circle cx='40' cy='37' r='5' />
            <text x='54' y='42'>×{Math.round(plan.slowdown)} SLOW</text>
          </g>
        )}
      </svg>

      {plan ? (
        <div className='replay'>
          <div
            className='replay__track'
            ref={timelineRef}
            role='slider'
            tabIndex={0}
            aria-label='Время от подачи команды'
            aria-valuemin={0}
            aria-valuemax={+plan.tEnd.toFixed(2)}
            aria-valuenow={+replayT.toFixed(2)}
            aria-valuetext={`${fmt(replayT, 2)} мс`}
            onPointerDown={onScrubStart}
            onPointerMove={onScrubMove}
            onKeyDown={onTimelineKey}
          >
            {plan.phases.map((ph) => (
              <div
                key={ph.key}
                className={`replay__phase ph-${ph.key} ${replayT >= ph.from && replayT < ph.to ? 'is-now' : ''}`}
                style={{ left: `${(ph.from / plan.tEnd) * 100}%`, width: `${((ph.to - ph.from) / plan.tEnd) * 100}%` }}
              >
                <span>{ph.label}</span>
              </div>
            ))}
            {plan.events.slice(1).map((ev) => (
              <i
                key={ev.t}
                className={`replay__tick ${replayT >= ev.t ? 'is-past' : ''}`}
                style={{ left: `${(ev.t / plan.tEnd) * 100}%` }}
              />
            ))}
            <div className='replay__t90' style={{ left: `${(plan.t90 / plan.tEnd) * 100}%` }}>
              <span>tср</span>
            </div>
            <div className='replay__head' style={{ left: `${(replayT / plan.tEnd) * 100}%` }} />
          </div>
          <div className='replay__scale'>
            <span>0 мс</span>
            <span>{fmt(plan.tEnd / 2, 1)} мс</span>
            <span>{fmt(plan.tEnd, 1)} мс</span>
          </div>
          {currentEvent && (
            <p className='replay__caption' key={currentEvent.t} aria-live='polite'>
              <b>{currentEvent.title}</b>
              {currentEvent.text}
            </p>
          )}
        </div>
      ) : (
        <div className='mechanism__legend'>
          <span><i className='lg-feed' />подача</span>
          <span><i className='lg-ex' />выхлоп</span>
          <span><i className='lg-pilot' />управляющий воздух</span>
          <span><i className='lg-coil' />ток катушки</span>
          <span className='lg-note'>яркость полости = давление</span>
        </div>
      )}
    </div>
  );
};
