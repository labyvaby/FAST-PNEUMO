import React, { useEffect, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { Link } from 'react-router-dom';
import { AXIS, COLORS, GRID, TOOLTIP } from '../../lib/chartSetup';
import { ControlPanel } from '../../components/ControlPanel';
import { Gauge } from '../../components/Gauge';
import { Scheme } from '../../components/Scheme';
import { MeasurementData, ResponseSample, Status } from '../../launchTypes';
import { useLaunchContext } from '../../useLaunchContext';
import {
  DEFAULT_PARAMS,
  SimPoint,
  ValveParams,
  crossingTime,
  positionAt,
  simulate,
  simulateReturn,
} from '../../lib/valveModel';

// Ориентир: самое долгое время выключения среди моделей каталога (Festo VUVG-L14 — 40 мс).
const RESPONSE_LIMIT_MS = 40;

// Каждое переключение считается той же физической моделью, что и в разделе «Расчёт».
// Давление питания берётся с «манометра» стенда, трение и напряжение немного гуляют от цикла
// к циклу — так у серии переключений появляется разброс, как на реальном стенде.
const STAND = {
  params: DEFAULT_PARAMS,
  supplyPressureKpa: DEFAULT_PARAMS.supplyBar * 100,
  nominalTemperature: 24,
  valveAreaMm2: 18,
  commandPeriodMs: 3200,
  tickMs: 100,
  frictionSpread: 0.15,
  voltageSpread: 0.05,
};

type XY = { x: number; y: number };

interface Transient {
  series: SimPoint[];
  responseMs: number;
}

interface ModelState {
  pressure: number;
  temperature: number;
  flow: number;
  position: number;
  targetPosition: number;
  velocity: number;
  energy: number;
  responseTimeMs: number | null;
}

interface ActiveSwitch {
  startedAt: number;
  series: SimPoint[];
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => +value.toFixed(2);
const round1 = (value: number) => +value.toFixed(1);
const spread = (value: number, relative: number) => value * (1 + (Math.random() * 2 - 1) * relative);

const ZERO_STATE: ModelState = {
  pressure: 0,
  temperature: 0,
  flow: 0,
  position: 0,
  targetPosition: 0,
  velocity: 0,
  energy: 0,
  responseTimeMs: null,
};

const Home: React.FC = () => {
  const { addLaunch, setCurrentStatus, status } = useLaunchContext();
  const [count, setCount] = useState<number>(0);
  const [pressure, setPressure] = useState<number>(0);
  const [temperature, setTemperature] = useState<number>(0);
  const [flow, setFlow] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);
  const [velocity, setVelocity] = useState<number>(0);
  const [energy, setEnergy] = useState<number>(0);
  const [lastResponseTime, setLastResponseTime] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [launchData, setLaunchData] = useState<MeasurementData[]>([]);
  const [isToggled, setIsToggled] = useState<boolean>(false);
  const [cycles, setCycles] = useState<ResponseSample[]>([]);
  const [transients, setTransients] = useState<{ forward?: Transient; reverse?: Transient }>({});

  const intervalRef = useRef<number | undefined>(undefined);
  const commandIntervalRef = useRef<number | undefined>(undefined);
  const initialCommandTimeoutRef = useRef<number | undefined>(undefined);
  const launchStartedAtRef = useRef<number | null>(null);
  const launchTimestampRef = useRef<string>('');
  const isRunningRef = useRef(false);
  const commandRef = useRef(false);
  const activeSwitchRef = useRef<ActiveSwitch | null>(null);
  const responseTimesRef = useRef<number[]>([]);
  const strokeSpeedRef = useRef(0);
  const currentValuesRef = useRef<ModelState>(ZERO_STATE);

  const setCurrentValues = (values: ModelState) => {
    currentValuesRef.current = values;
    setPressure(values.pressure);
    setTemperature(values.temperature);
    setFlow(values.flow);
    setPosition(values.position);
    setVelocity(values.velocity);
    setEnergy(values.energy);
    setLastResponseTime(values.responseTimeMs);
  };

  const clearTimers = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    if (commandIntervalRef.current) {
      clearInterval(commandIntervalRef.current);
      commandIntervalRef.current = undefined;
    }
    if (initialCommandTimeoutRef.current) {
      clearTimeout(initialCommandTimeoutRef.current);
      initialCommandTimeoutRef.current = undefined;
    }
  };

  const appendMeasurement = (values: ModelState, state: boolean) => {
    const startedAt = launchStartedAtRef.current ?? Date.now();
    const elapsedSeconds = round((Date.now() - startedAt) / 1000);

    setLaunchData((prevData) => [
      ...prevData,
      {
        time: new Date().toLocaleTimeString(),
        elapsedSeconds,
        state,
        ...values,
      },
    ]);
  };

  /** Подаёт команду и сразу рассчитывает переходный процесс переключения. */
  const switchCommand = () => {
    const forward = !commandRef.current;
    commandRef.current = forward;
    setIsToggled(forward);

    const supplyKpa = currentValuesRef.current.pressure || STAND.supplyPressureKpa;
    const params: ValveParams = {
      ...STAND.params,
      supplyBar: supplyKpa / 100,
      friction: spread(STAND.params.friction, STAND.frictionSpread),
      voltage: spread(STAND.params.voltage, STAND.voltageSpread),
    };
    const result = forward ? simulate(params) : simulateReturn(params);
    const crossing = result.ok ? crossingTime(result.series, forward ? 90 : 10, forward) : null;
    const time = new Date().toLocaleTimeString();
    const label = forward ? 'Прямой ход' : 'Обратный ход';

    if (crossing === null) {
      activeSwitchRef.current = null;
      setModelError(result.reason ?? `${label}: золотник не прошёл порог хода`);
      setHistory((prev) => [...prev, `${label} не завершён ${time}`]);
      return;
    }

    const ms = round1(crossing);
    activeSwitchRef.current = { startedAt: performance.now(), series: result.series };
    responseTimesRef.current = [...responseTimesRef.current, ms];
    strokeSpeedRef.current = result.tMove > 0 ? (STAND.params.strokeMm / result.tMove) * 1000 : 0;
    currentValuesRef.current = { ...currentValuesRef.current, responseTimeMs: ms };
    setLastResponseTime(ms);
    setModelError(null);
    setCycles((prev) => [...prev, { forward, ms }]);
    setTransients((prev) => ({ ...prev, [forward ? 'forward' : 'reverse']: { series: result.series, responseMs: ms } }));
    setHistory((prev) => [...prev, `${label} · ${ms} мс · ${time}`]);
  };

  /** Тик индикаторов стенда: положение берётся из рассчитанной кривой, остальное — оценки. */
  const updateValues = () => {
    const previous = currentValuesRef.current;
    const dt = STAND.tickMs / 1000;
    const target = commandRef.current ? 100 : 0;
    const active = activeSwitchRef.current;
    const nextPosition = active ? positionAt(active.series, performance.now() - active.startedAt) : previous.position;

    const pressureLoss = Math.abs(target - previous.position) * 0.18;
    const pressureRipple = Math.sin((Date.now() - (launchStartedAtRef.current ?? Date.now())) / 420) * 1.5;
    const supplyPressure = clamp(STAND.supplyPressureKpa - pressureLoss + pressureRipple, 540, 620);
    // скорость изменения показаний за тик — для оценки расхода и нагрева
    const tickVelocity = (((nextPosition - previous.position) / 100) * STAND.params.strokeMm) / dt;
    const nextTemperature = clamp(previous.temperature + Math.abs(tickVelocity) * 0.003 - 0.015, 22, 38);
    const flowM3H = clamp(
      (Math.abs(tickVelocity) * STAND.valveAreaMm2 * 0.0036) / 10 + (isRunningRef.current ? 0.18 : 0),
      0,
      7
    );
    const pneumaticPowerKw = (supplyPressure * flowM3H) / 3600;

    const nextValues: ModelState = {
      pressure: round(supplyPressure),
      temperature: round(nextTemperature),
      flow: round(flowM3H),
      position: round(nextPosition),
      targetPosition: target,
      velocity: round(strokeSpeedRef.current),
      energy: previous.energy + (pneumaticPowerKw * dt) / 3600,
      responseTimeMs: previous.responseTimeMs,
    };

    setCurrentValues(nextValues);
    appendMeasurement(nextValues, commandRef.current);
  };

  const handleStart = () => {
    if (isRunningRef.current || status === Status.STARTED) {
      return;
    }

    clearTimers();
    isRunningRef.current = true;
    setCurrentStatus(Status.STARTED);
    setCount(count + 1);
    launchStartedAtRef.current = Date.now();
    launchTimestampRef.current = new Date().toLocaleString();
    commandRef.current = false;
    activeSwitchRef.current = null;
    responseTimesRef.current = [];
    strokeSpeedRef.current = 0;

    const initialValues: ModelState = {
      ...ZERO_STATE,
      pressure: STAND.supplyPressureKpa,
      temperature: STAND.nominalTemperature,
    };

    setCurrentValues(initialValues);
    setErrors([]);
    setWarnings([]);
    setModelError(null);
    setLaunchData([]);
    setCycles([]);
    setTransients({});
    setIsToggled(false);
    setHistory((prevHistory) => [...prevHistory, `Запущена ${launchTimestampRef.current}`]);
    appendMeasurement(initialValues, false);
    intervalRef.current = window.setInterval(updateValues, STAND.tickMs);
    initialCommandTimeoutRef.current = window.setTimeout(switchCommand, 300);
    commandIntervalRef.current = window.setInterval(switchCommand, STAND.commandPeriodMs);
  };

  const handleStop = () => {
    if (!isRunningRef.current && status !== Status.STARTED) {
      return;
    }

    clearTimers();
    isRunningRef.current = false;
    setCurrentStatus(Status.STOPPED);
    const endTimestamp = new Date().toLocaleString();
    const durationSeconds = launchStartedAtRef.current
      ? round((Date.now() - launchStartedAtRef.current) / 1000)
      : 0;
    const source: Pick<MeasurementData, 'pressure' | 'temperature' | 'flow' | 'position' | 'velocity' | 'energy'>[] =
      launchData.length > 0 ? launchData : [{ ...currentValuesRef.current }];
    const averageField = (field: 'pressure' | 'temperature' | 'flow' | 'position' | 'velocity' | 'energy') =>
      round(source.reduce((sum, sample) => sum + sample[field], 0) / source.length);
    const responseTimes = responseTimesRef.current;
    const averageResponseTimeMs =
      responseTimes.length > 0 ? round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : 0;

    addLaunch({
      id: `${Date.now()}-${count}`,
      timestamp: launchTimestampRef.current || endTimestamp,
      endTimestamp,
      cycles: responseTimes.length,
      durationSeconds,
      samplesCount: launchData.length,
      pressure: averageField('pressure'),
      temperature: averageField('temperature'),
      flow: averageField('flow'),
      position: averageField('position'),
      velocity: averageField('velocity'),
      energy: averageField('energy'),
      averageResponseTimeMs,
      minResponseTimeMs: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTimeMs: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      responses: cycles,
    });
    setHistory((prevHistory) => [...prevHistory, `Остановлена ${endTimestamp}`]);
    launchStartedAtRef.current = null;
    launchTimestampRef.current = '';
    activeSwitchRef.current = null;
  };

  const handleReset = () => {
    clearTimers();
    setCount(0);
    setCurrentStatus(Status.STOPPED);
    launchStartedAtRef.current = null;
    launchTimestampRef.current = '';
    isRunningRef.current = false;
    commandRef.current = false;
    activeSwitchRef.current = null;
    responseTimesRef.current = [];
    strokeSpeedRef.current = 0;
    setCurrentValues(ZERO_STATE);
    setErrors([]);
    setWarnings([]);
    setModelError(null);
    setHistory((prevHistory) => [...prevHistory, `Сброс ${new Date().toLocaleString()}`]);
    setLaunchData([]);
    setCycles([]);
    setTransients({});
    setIsToggled(false);
  };

  useEffect(() => {
    return clearTimers;
  }, []);

  useEffect(() => {
    const nextWarnings: string[] = [];
    const nextErrors: string[] = [];

    if (status === Status.STARTED) {
      if (pressure < 560) {
        nextWarnings.push('Давление питания ниже расчётного уровня');
      }
      if (temperature > 34) {
        nextWarnings.push('Повышенная температура воздуха');
      }
      if (lastResponseTime && lastResponseTime > RESPONSE_LIMIT_MS) {
        nextErrors.push('Время срабатывания превышает допустимый предел');
      }
      if (modelError) {
        nextErrors.push(modelError);
      }
    }

    setWarnings(nextWarnings);
    setErrors(nextErrors);
  }, [lastResponseTime, modelError, pressure, status, temperature]);

  const averageValue = (
    field: keyof Pick<MeasurementData, 'pressure' | 'temperature' | 'flow' | 'position' | 'velocity' | 'energy'>
  ) => {
    if (launchData.length === 0) {
      return currentValuesRef.current[field];
    }

    return round(launchData.reduce((sum, measurement) => sum + measurement[field], 0) / launchData.length);
  };

  const mean = (values: number[]) =>
    values.length > 0 ? round1(values.reduce((sum, v) => sum + v, 0) / values.length) : null;
  const averageResponseTime = mean(cycles.map((c) => c.ms));
  const forwardMean = mean(cycles.filter((c) => c.forward).map((c) => c.ms));
  const reverseMean = mean(cycles.filter((c) => !c.forward).map((c) => c.ms));
  const recentCycles = cycles.slice(-24);
  const barScale = Math.max(RESPONSE_LIMIT_MS * 1.12, ...recentCycles.map((c) => c.ms));

  const isStarted = status === Status.STARTED;

  // кривая последнего переключения в каждую сторону, время — от команды, мс
  const curves = [
    { t: transients.forward, label: 'Прямой ход, %', color: COLORS.teal, fill: 'rgba(31,182,206,0.10)' },
    { t: transients.reverse, label: 'Обратный ход, %', color: COLORS.violet, fill: 'rgba(139,108,255,0.08)' },
  ];
  const chartMax = Math.ceil(
    Math.max(10, ...curves.flatMap(({ t }) => (t ? [t.series[t.series.length - 1].t] : [])))
  );
  const level = (y: number): XY[] => [
    { x: 0, y },
    { x: chartMax, y },
  ];
  const curveData: ChartData<'line', XY[]> = {
    datasets: [
      ...curves.flatMap(({ t, label, color, fill }) =>
        t
          ? [
              {
                label,
                data: t.series.map((point) => ({ x: point.t, y: point.x })),
                borderColor: color,
                backgroundColor: fill,
                fill: true,
                borderWidth: 2.5,
                pointRadius: 0,
              },
              {
                label: `tср ${t.responseMs} мс`,
                data: [
                  { x: t.responseMs, y: 0 },
                  { x: t.responseMs, y: 100 },
                ],
                borderColor: color,
                borderDash: [3, 4],
                borderWidth: 1.5,
                pointRadius: 0,
              },
            ]
          : []
      ),
      { label: 'Порог 90%', data: level(90), borderColor: COLORS.faint, borderDash: [4, 4], borderWidth: 1, pointRadius: 0 },
      { label: 'Порог 10%', data: level(10), borderColor: COLORS.faint, borderDash: [4, 4], borderWidth: 1, pointRadius: 0 },
    ],
  };

  const curveOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'nearest', axis: 'x' },
    plugins: {
      legend: { display: false },
      tooltip: { ...TOOLTIP, filter: (item) => (item.dataset.label ?? '').includes('ход') },
    },
    scales: {
      x: {
        type: 'linear',
        min: 0,
        max: chartMax,
        title: { display: true, text: 'время от команды, мс' },
        grid: { color: GRID },
        border: { color: AXIS },
      },
      y: {
        min: 0,
        max: 100,
        ticks: { stepSize: 10 },
        title: { display: true, text: 'x, % хода' },
        grid: { color: GRID },
        border: { display: false },
      },
    },
  };

  const params = [
    ['P', `${STAND.params.supplyBar} бар`],
    ['m', `${STAND.params.spoolMassG} г`],
    ['ход', `${STAND.params.strokeMm} мм`],
    ['d канала', `${STAND.params.channelMm} мм`],
    ['μ', `${STAND.params.friction} ±${STAND.frictionSpread * 100}%`],
    ['U', `${STAND.params.voltage} В ±${STAND.voltageSpread * 100}%`],
    ['период', `${STAND.commandPeriodMs / 1000} с`],
  ];

  return (
    <>
      <section className='hero'>
        <div className='wrap hero-grid'>
          <div className='hero-copy'>
            <p className='kicker'>
              <b>I</b> · Лабораторный стенд · распределитель 5/2
            </p>
            <h1 className='hero-h'>
              Время срабатывания: от&nbsp;импульса до{' '}
              <span className='ring-word'>
                90% хода
                <svg viewBox='0 0 300 120' preserveAspectRatio='none' aria-hidden='true'>
                  <path d='M34 66 C 24 20, 270 8, 284 54 C 296 102, 44 118, 16 74 C 4 50, 64 18, 156 14' pathLength={1} />
                </svg>
              </span>
            </h1>
            <p className='hero-sub'>
              Исследование быстродействия пневматического золотникового распределителя. Стенд
              подаёт управляющий импульс каждые {STAND.commandPeriodMs / 1000} с и считает <b>tср</b> —
              время от команды до прохождения 90% хода при прямом переключении или 10% при обратном.
              Каждое переключение рассчитывается физической моделью из раздела «Расчёт»: катушка,
              пилотная камера, движение золотника.
            </p>
            <ul className='params' aria-label='Параметры модели'>
              {params.map(([k, v]) => (
                <li key={k}>
                  {k} <b>{v}</b>
                </li>
              ))}
            </ul>
          </div>
          <Gauge
            position={position}
            responseTimeMs={lastResponseTime}
            isForward={isToggled}
            isRunning={isStarted}
          />
        </div>
      </section>

      <section className='act' id='run'>
        <div className='wrap'>
          <div className='head2'>
            <p className='kicker'>
              <b>II</b> · Пуск и пневмосхема
            </p>
            <div className='head2-row'>
              <h2 className='h2x'>Пульт стенда и&nbsp;живая схема</h2>
              <p className='sub2'>
                «Запуск» начинает серию переключений, «Стоп» сохраняет запуск в отчёты. На схеме
                подсвечены активные каналы распределителя и направление потоков воздуха.
              </p>
            </div>
          </div>

          <div className='run-grid'>
            <ControlPanel
              status={status}
              count={count}
              pressure={pressure}
              temperature={temperature}
              flow={flow}
              position={position}
              velocity={velocity}
              responseTimeMs={lastResponseTime}
              energy={energy}
              errors={errors}
              warnings={warnings}
              history={history}
              onStart={handleStart}
              onStop={handleStop}
              onReset={handleReset}
            />
            <div className='stack'>
              <div className='stats' style={{ '--cols': 4 } as React.CSSProperties}>
                <div className='stat hi' style={{ '--acc': '#1FB6CE' } as React.CSSProperties}>
                  <span><i className='sym'>tср</i> прямой</span>
                  <b>{forwardMean ?? '—'}<small>мс</small></b>
                  <em>среднее, P→A</em>
                </div>
                <div className='stat hi' style={{ '--acc': '#8B6CFF' } as React.CSSProperties}>
                  <span><i className='sym'>tср</i> обратный</span>
                  <b>{reverseMean ?? '—'}<small>мс</small></b>
                  <em>среднее, P→B</em>
                </div>
                <div className='stat'>
                  <span>Переключений</span>
                  <b>{cycles.length}</b>
                  <em>за запуск</em>
                </div>
                <div className='stat'>
                  <span>Предел</span>
                  <b>{RESPONSE_LIMIT_MS}<small>мс</small></b>
                  <em>худшее tвыкл в каталоге</em>
                </div>
              </div>
              <div className='card' style={{ '--acc': isToggled ? '#1FB6CE' : '#8B6CFF' } as React.CSSProperties}>
                <div className='card-h'>
                  <div>
                    <h3 className='card-t'>Рабочая схема пневмосистемы</h3>
                    <p className='card-s'>Компрессор → фильтр → распределитель 5/2 → цилиндр</p>
                  </div>
                  <span className='tag'>
                    <i />
                    {isToggled ? 'канал P→A' : 'канал P→B'}
                  </span>
                </div>
                <div className='scheme-scroll'>
                  <Scheme isToggled={isToggled} position={position} pressure={pressure} flow={flow} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className='act' id='curve'>
        <div className='wrap'>
          <div className='head2'>
            <p className='kicker'>
              <b>III</b> · Кривая быстродействия
            </p>
            <div className='head2-row'>
              <h2 className='h2x'>Как золотник догоняет команду</h2>
              <p className='sub2'>
                Команда подаётся в момент 0. Кривая — положение золотника в последнем переключении
                в каждую сторону; момент, когда она пересекает пунктир 90% или 10%, и есть время
                срабатывания.
              </p>
            </div>
          </div>

          <div className='curve-grid'>
            <div className='card'>
              <div className='card-h'>
                <div>
                  <h3 className='card-t'>Переходный процесс переключения</h3>
                  <p className='card-s'>Последний прямой и обратный ход, мс от команды</p>
                </div>
                <span className='tag'>
                  <i />
                  {lastResponseTime !== null ? `tср ${lastResponseTime} мс` : 'нет данных'}
                </span>
              </div>
              <div className='chart-box'>
                {transients.forward || transients.reverse ? (
                  <Line data={curveData} options={curveOptions} />
                ) : (
                  <div className='bars-empty'>Кривая появится после первого переключения</div>
                )}
              </div>
              <div className='legend'>
                <span><i style={{ '--c': COLORS.teal } as React.CSSProperties} />прямой ход</span>
                <span><i style={{ '--c': COLORS.violet } as React.CSSProperties} />обратный ход</span>
                <span><i className='dash' style={{ '--c': 'rgba(244,242,238,.5)' } as React.CSSProperties} />пороги 10 / 90%</span>
              </div>
            </div>

            <div className='card' style={{ '--acc': '#8B6CFF' } as React.CSSProperties}>
              <div className='card-h'>
                <div>
                  <h3 className='card-t'>Серия переключений</h3>
                  <p className='card-s'>tср каждого переключения, последние 24</p>
                </div>
              </div>
              {recentCycles.length === 0 ? (
                <div className='bars-empty'>Столбики появятся после первого переключения</div>
              ) : (
                <div className='bars' role='img' aria-label='Время срабатывания по переключениям'>
                  <div className='limit' style={{ bottom: `${(RESPONSE_LIMIT_MS / barScale) * 100}%` }}>
                    <span>предел {RESPONSE_LIMIT_MS} мс</span>
                  </div>
                  {recentCycles.map((cycle, index) => (
                    <i
                      key={index}
                      title={`${cycle.forward ? 'прямой' : 'обратный'}: ${cycle.ms} мс`}
                      style={{
                        height: `${(cycle.ms / barScale) * 100}%`,
                        '--c': cycle.forward ? '#1FB6CE' : '#8B6CFF',
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
              <div className='legend'>
                <span><i style={{ '--c': '#1FB6CE' } as React.CSSProperties} />прямой</span>
                <span><i style={{ '--c': '#8B6CFF' } as React.CSSProperties} />обратный</span>
              </div>
              <ul className='avg-list'>
                <li>Среднее tср за запуск<b>{averageResponseTime !== null ? `${averageResponseTime} мс` : '—'}</b></li>
                <li>Давление, среднее<b>{averageValue('pressure')} кПа</b></li>
                <li>Расход, средний<b>{averageValue('flow')} м³/ч</b></li>
                <li>Скорость золотника на ходе<b>{averageValue('velocity')} мм/с</b></li>
                <li>Температура воздуха<b>{averageValue('temperature')} °C</b></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className='act' id='usage'>
        <div className='wrap'>
          <div className='head2'>
            <p className='kicker'>
              <b>IV</b> · Где применяется
            </p>
            <div className='head2-row'>
              <h2 className='h2x'>Одна задача — разная цена миллисекунды</h2>
              <p className='sub2'>
                Везде распределитель делает одно и то же: по команде направляет сжатый воздух в одну
                полость цилиндра и выпускает его из другой. Отличается то, что стоит за цилиндром, — а
                значит, и то, к чему приводит медленное переключение.
              </p>
            </div>
          </div>
          <div className='tiles'>
            {USAGE.map((item, index) => (
              <article key={item.name} className='tile' style={{ '--acc': item.acc } as React.CSSProperties}>
                <p className='tile-top'>
                  <b>{String(index + 1).padStart(2, '0')}</b> {item.drives}
                </p>
                <h3 className='tile-name'>{item.name}</h3>
                <p className='tile-h'>{item.why}</p>
                <p className='tile-val' style={{ fontSize: 'clamp(18px, 1.6vw, 24px)' }}>{item.matters}</p>
              </article>
            ))}
          </div>
          <div className='ctl-btns' style={{ marginTop: 20, alignItems: 'center' }}>
            <Link className='btn btn-light' to='/calculator'>
              Посчитать время для своих параметров
            </Link>
            <Link className='btn btn-ghost' to='/catalog'>
              Сравнить модели в каталоге
            </Link>
          </div>
        </div>
      </section>
    </>
  );
};

const USAGE = [
  {
    name: 'Станки и промышленная автоматика',
    drives: 'зажим, подача',
    why: 'Зажим детали и подача заготовки повторяются в каждом цикле: время переключения прямо входит во время цикла и в число деталей за смену.',
    matters: 'время цикла',
    acc: '#1FB6CE',
  },
  {
    name: 'Пневмолинии и конвейеры',
    drives: 'толкатели, отсекатели',
    why: 'Толкатель или отсекатель должен сработать, пока изделие проходит мимо: от быстродействия зависит допустимая скорость ленты при сортировке и упаковке.',
    matters: 'скорость линии',
    acc: '#44C18A',
  },
  {
    name: 'Робототехника',
    drives: 'захваты, приводы',
    why: 'Задержка открытия или закрытия захвата сдвигает момент, когда деталь зажата или отпущена; разброс времени срабатывания превращается в ошибку позиционирования.',
    matters: 'точность и повторяемость',
    acc: '#3E74F0',
  },
  {
    name: 'Транспорт и спецтехника',
    drives: 'тормоза, двери',
    why: 'Время срабатывания пневматического тормозного привода добавляется к тормозному пути; дверные приводы должны реагировать быстро и одинаково каждый раз.',
    matters: 'безопасность',
    acc: '#F2B43C',
  },
];

export default Home;
