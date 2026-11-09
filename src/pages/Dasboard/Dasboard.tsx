import React, { useEffect, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Link } from 'react-router-dom';
import '../../lib/chartSetup';
import { ControlPanel } from '../../components/ControlPanel';
import { Gauge } from '../../components/Gauge';
import { Scheme } from '../../components/Scheme';
import { MeasurementData, Status } from '../../launchTypes';
import { useLaunchContext } from '../../useLaunchContext';

const RESPONSE_LIMIT_MS = 950;

interface CycleResult {
  forward: boolean;
  ms: number;
}

const ENGINEERING_MODEL = {
  supplyPressureKpa: 600,
  nominalTemperature: 24,
  strokeMm: 6,
  spoolMassGram: 82,
  valveAreaMm2: 18,
  commandPeriodMs: 3200,
  solverStepMs: 100,
  pneumaticDelayMs: 34,
  timeConstantSeconds: 0.28,
};

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
  targetPosition: number;
  previousTargetPosition: number;
  direction: boolean;
}

const Home: React.FC = () => {
  const { addLaunch, setCurrentStatus, status } = useLaunchContext();
  const [count, setCount] = useState<number>(0);
  const [pressure, setPressure] = useState<number>(0);
  const [temperature, setTemperature] = useState<number>(0);
  const [flow, setFlow] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);
  const [, setTargetPosition] = useState<number>(0);
  const [velocity, setVelocity] = useState<number>(0);
  const [energy, setEnergy] = useState<number>(0);
  const [lastResponseTime, setLastResponseTime] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [launchData, setLaunchData] = useState<MeasurementData[]>([]);
  const [isToggled, setIsToggled] = useState<boolean>(false);
  const [cycles, setCycles] = useState<CycleResult[]>([]);

  const intervalRef = useRef<number | undefined>(undefined);
  const commandIntervalRef = useRef<number | undefined>(undefined);
  const initialCommandTimeoutRef = useRef<number | undefined>(undefined);
  const launchStartedAtRef = useRef<number | null>(null);
  const launchTimestampRef = useRef<string>('');
  const isRunningRef = useRef(false);
  const commandRef = useRef(false);
  const activeSwitchRef = useRef<ActiveSwitch | null>(null);
  const responseTimesRef = useRef<number[]>([]);
  const currentValuesRef = useRef<ModelState>({
    pressure: 0,
    temperature: 0,
    flow: 0,
    position: 0,
    targetPosition: 0,
    velocity: 0,
    energy: 0,
    responseTimeMs: null,
  });

  const clamp = (value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  };

  const round = (value: number) => {
    return +value.toFixed(2);
  };

  const setCurrentValues = (values: ModelState) => {
    currentValuesRef.current = values;
    setPressure(values.pressure);
    setTemperature(values.temperature);
    setFlow(values.flow);
    setPosition(values.position);
    setTargetPosition(values.targetPosition);
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

  const switchCommand = () => {
    const nextCommand = !commandRef.current;
    commandRef.current = nextCommand;
    setIsToggled(nextCommand);
    activeSwitchRef.current = {
      startedAt: Date.now(),
      targetPosition: nextCommand ? 100 : 0,
      previousTargetPosition: currentValuesRef.current.targetPosition,
      direction: nextCommand,
    };
    setHistory((prevHistory) => [
      ...prevHistory,
      `${nextCommand ? 'Прямой ход' : 'Обратный ход'} ${new Date().toLocaleTimeString()}`,
    ]);
  };

  const updateValues = () => {
    const previous = currentValuesRef.current;
    const dt = ENGINEERING_MODEL.solverStepMs / 1000;
    const target = commandRef.current ? 100 : 0;
    const pressureLoss = Math.abs(target - previous.position) * 0.18;
    const pressureRipple =
      Math.sin((Date.now() - (launchStartedAtRef.current ?? Date.now())) / 420) * 1.5;
    const supplyPressure = clamp(
      ENGINEERING_MODEL.supplyPressureKpa - pressureLoss + pressureRipple,
      540,
      620
    );
    const temperatureRise = Math.abs(previous.velocity) * 0.003;
    const nextTemperature = clamp(
      previous.temperature + temperatureRise - 0.015,
      22,
      38
    );
    const pressureFactor = ENGINEERING_MODEL.supplyPressureKpa / supplyPressure;
    const thermalFactor = 1 + (nextTemperature - ENGINEERING_MODEL.nominalTemperature) * 0.006;
    const tau =
      ENGINEERING_MODEL.timeConstantSeconds * pressureFactor * thermalFactor;
    const alpha = 1 - Math.exp(-dt / tau);
    const delayPassed = activeSwitchRef.current
      ? Date.now() - activeSwitchRef.current.startedAt >=
        ENGINEERING_MODEL.pneumaticDelayMs
      : true;
    const delayedTarget = activeSwitchRef.current
      ? delayPassed
        ? activeSwitchRef.current.targetPosition
        : activeSwitchRef.current.previousTargetPosition
      : target;
    const nextPosition = clamp(
      previous.position + (delayedTarget - previous.position) * alpha,
      0,
      100
    );
    const velocityMmS =
      ((nextPosition - previous.position) / 100) *
      ENGINEERING_MODEL.strokeMm /
      dt;
    const flowM3H = clamp(
      (Math.abs(velocityMmS) * ENGINEERING_MODEL.valveAreaMm2 * 0.0036) / 10 +
        (isRunningRef.current ? 0.18 : 0),
      0,
      7
    );
    const pneumaticPowerKw = (supplyPressure * flowM3H) / 3600;
    const nextEnergy = previous.energy + (pneumaticPowerKw * dt) / 3600;
    let responseTimeMs = previous.responseTimeMs;

    if (activeSwitchRef.current) {
      const threshold = activeSwitchRef.current.direction ? 90 : 10;
      const reached = activeSwitchRef.current.direction
        ? nextPosition >= threshold
        : nextPosition <= threshold;

      if (delayPassed && reached) {
        responseTimeMs = Date.now() - activeSwitchRef.current.startedAt;
        responseTimesRef.current = [...responseTimesRef.current, responseTimeMs];
        const result = { forward: activeSwitchRef.current.direction, ms: responseTimeMs };
        setCycles((prev) => [...prev, result]);
        activeSwitchRef.current = null;
      }
    }

    const nextValues = {
      pressure: round(supplyPressure),
      temperature: round(nextTemperature),
      flow: round(flowM3H),
      position: round(nextPosition),
      targetPosition: target,
      velocity: round(velocityMmS),
      energy: nextEnergy,
      responseTimeMs,
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
    const nextCount = count + 1;
    setCount(nextCount);
    launchStartedAtRef.current = Date.now();
    launchTimestampRef.current = new Date().toLocaleString();
    commandRef.current = false;
    activeSwitchRef.current = null;
    responseTimesRef.current = [];

    const initialValues = {
      pressure: ENGINEERING_MODEL.supplyPressureKpa,
      temperature: ENGINEERING_MODEL.nominalTemperature,
      flow: 0,
      position: 0,
      targetPosition: 0,
      velocity: 0,
      energy: 0,
      responseTimeMs: null,
    };

    setCurrentValues(initialValues);
    setErrors([]);
    setWarnings([]);
    setLaunchData([]);
    setCycles([]);
    setIsToggled(false);
    setHistory((prevHistory) => [
      ...prevHistory,
      `Запущена ${launchTimestampRef.current}`,
    ]);
    appendMeasurement(initialValues, false);
    intervalRef.current = window.setInterval(
      updateValues,
      ENGINEERING_MODEL.solverStepMs
    );
    initialCommandTimeoutRef.current = window.setTimeout(switchCommand, 300);
    commandIntervalRef.current = window.setInterval(
      switchCommand,
      ENGINEERING_MODEL.commandPeriodMs
    );
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
    const samples = launchData.length > 0 ? launchData : [];
    const source =
      samples.length > 0 ? samples : [{ ...currentValuesRef.current }];
    const averageField = (
      field: 'pressure' | 'temperature' | 'flow' | 'position' | 'velocity' | 'energy'
    ) => round(source.reduce((sum, sample) => sum + sample[field], 0) / source.length);
    const responseTimes = responseTimesRef.current;
    const averageResponseTimeMs =
      responseTimes.length > 0
        ? round(
            responseTimes.reduce((sum, value) => sum + value, 0) /
              responseTimes.length
          )
        : 0;

    addLaunch({
      id: `${Date.now()}-${count}`,
      timestamp: launchTimestampRef.current || endTimestamp,
      endTimestamp,
      cycles: count,
      durationSeconds,
      samplesCount: samples.length,
      pressure: averageField('pressure'),
      temperature: averageField('temperature'),
      flow: averageField('flow'),
      position: averageField('position'),
      velocity: averageField('velocity'),
      energy: averageField('energy'),
      averageResponseTimeMs,
      minResponseTimeMs: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTimeMs: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
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
    setCurrentValues({
      pressure: 0,
      temperature: 0,
      flow: 0,
      position: 0,
      targetPosition: 0,
      velocity: 0,
      energy: 0,
      responseTimeMs: null,
    });
    setErrors([]);
    setWarnings([]);
    setHistory((prevHistory) => [
      ...prevHistory,
      `Сброс ${new Date().toLocaleString()}`,
    ]);
    setLaunchData([]);
    setCycles([]);
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
    }

    setWarnings(nextWarnings);
    setErrors(nextErrors);
  }, [lastResponseTime, pressure, status, temperature]);

  const averageValue = (
    field: keyof Pick<
      MeasurementData,
      'pressure' | 'temperature' | 'flow' | 'position' | 'velocity' | 'energy'
    >
  ) => {
    if (launchData.length === 0) {
      return currentValuesRef.current[field];
    }

    return round(
      launchData.reduce((sum, measurement) => sum + measurement[field], 0) /
        launchData.length
    );
  };

  const averageResponseTime =
    responseTimesRef.current.length > 0
      ? round(
          responseTimesRef.current.reduce((sum, value) => sum + value, 0) /
            responseTimesRef.current.length
        )
      : 0;

  const isStarted = status === Status.STARTED;
  const lastMeasurement = launchData[launchData.length - 1];

  // окно графика: последние 15 секунд, чтобы кривая не сжималась при долгом запуске
  const windowData = launchData.slice(-150);
  const flat = (value: number) => windowData.map(() => value);
  const data = {
    labels: windowData.map((measurement) => `${measurement.elapsedSeconds.toFixed(1)} c`),
    datasets: [
      {
        label: 'Положение золотника, %',
        data: windowData.map((measurement) => measurement.position),
        borderColor: '#1FB6CE',
        backgroundColor: 'rgba(31,182,206,0.12)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.35,
      },
      {
        label: 'Команда, %',
        data: windowData.map((measurement) => measurement.targetPosition),
        borderColor: '#F2B43C',
        borderWidth: 1.5,
        pointRadius: 0,
        stepped: true,
      },
      {
        label: 'Расход ×10, м³/ч',
        data: windowData.map((measurement) => measurement.flow * 10),
        borderColor: '#44C18A',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: 'Порог 90%',
        data: flat(90),
        borderColor: 'rgba(244,242,238,0.28)',
        borderDash: [4, 4],
        borderWidth: 1,
        pointRadius: 0,
      },
      {
        label: 'Порог 10%',
        data: flat(10),
        borderColor: 'rgba(244,242,238,0.28)',
        borderDash: [4, 4],
        borderWidth: 1,
        pointRadius: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(10,11,20,0.95)',
        borderColor: 'rgba(255,255,255,0.17)',
        borderWidth: 1,
        titleColor: '#F4F2EE',
        bodyColor: '#B9B7C8',
        padding: 10,
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { stepSize: 10 },
        grid: { color: 'rgba(255,255,255,0.06)' },
        border: { display: false },
      },
      x: {
        ticks: { maxTicksLimit: 8, maxRotation: 0 },
        grid: { display: false },
        border: { color: 'rgba(255,255,255,0.17)' },
      },
    },
  };

  const mean = (values: number[]) =>
    values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null;
  const forwardMean = mean(cycles.filter((c) => c.forward).map((c) => c.ms));
  const reverseMean = mean(cycles.filter((c) => !c.forward).map((c) => c.ms));
  const recentCycles = cycles.slice(-24);
  const barScale = Math.max(RESPONSE_LIMIT_MS * 1.12, ...recentCycles.map((c) => c.ms));

  const params = [
    ['P', `${ENGINEERING_MODEL.supplyPressureKpa} кПа`],
    ['ход', `${ENGINEERING_MODEL.strokeMm} мм`],
    ['m', `${ENGINEERING_MODEL.spoolMassGram} г`],
    ['τ', `${ENGINEERING_MODEL.timeConstantSeconds} с`],
    ['задержка', `${ENGINEERING_MODEL.pneumaticDelayMs} мс`],
    ['период', `${ENGINEERING_MODEL.commandPeriodMs / 1000} с`],
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
              подаёт управляющий импульс каждые {ENGINEERING_MODEL.commandPeriodMs / 1000} с,
              следит за золотником и считает <b>tср</b> — время от команды до прохождения 90% хода
              при прямом переключении или 10% при обратном.
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
                  <em>выше — ошибка</em>
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
                Ступенька — управляющая команда, бирюзовая кривая — фактическое положение. Момент,
                когда кривая пересекает пунктир 90% или 10%, и даёт время срабатывания.
              </p>
            </div>
          </div>

          <div className='curve-grid'>
            <div className='card'>
              <div className='card-h'>
                <div>
                  <h3 className='card-t'>Команда, положение и расход</h3>
                  <p className='card-s'>Последние 15 секунд запуска</p>
                </div>
                <span className='tag'>
                  <i />
                  {lastMeasurement ? `${lastMeasurement.elapsedSeconds.toFixed(1)} c` : '0 c'}
                </span>
              </div>
              <div className='chart-box'>
                <Line data={data} options={chartOptions} />
              </div>
              <div className='legend'>
                <span><i style={{ '--c': '#1FB6CE' } as React.CSSProperties} />положение, %</span>
                <span><i style={{ '--c': '#F2B43C' } as React.CSSProperties} />команда, %</span>
                <span><i style={{ '--c': '#44C18A' } as React.CSSProperties} />расход ×10, м³/ч</span>
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
                <li>Среднее tср за запуск<b>{averageResponseTime ? `${averageResponseTime} мс` : '—'}</b></li>
                <li>Давление, среднее<b>{averageValue('pressure')} кПа</b></li>
                <li>Расход, средний<b>{averageValue('flow')} м³/ч</b></li>
                <li>Скорость золотника<b>{averageValue('velocity')} мм/с</b></li>
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

