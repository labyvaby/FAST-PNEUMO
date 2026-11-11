// Модель конфигурации стенда: из выбранных приборов — бюджет погрешности, задержки по цепочке,
// рекомендации (с привязкой к элементу схемы) и раскладка каналов регистратора.

import { COLORS } from '../../lib/chartSetup';

export type Pulse = 'gen' | 'mcu' | 'plc';
export type Driver = 'mosfet' | 'ssr' | 'relay';
export type Displacement = 'laser' | 'lvdt' | 'inductive' | 'none';
export type Recorder = 'scope' | 'daq' | 'plc';
export type Level = 'err' | 'warn' | 'info' | 'ok';
/** Элемент схемы, к которому относится рекомендация или звено задержки. */
export type Target = 'pulse' | 'driver' | 'current' | 'valve' | 'disp' | 'tube' | 'pressure' | 'recorder';

export const PULSE: Record<Pulse, { label: string; sub: string }> = {
  gen: { label: 'Генератор импульсов', sub: 'джиттер ≈ 1 мкс' },
  mcu: { label: 'Микроконтроллер', sub: 'джиттер ≈ 20 мкс' },
  plc: { label: 'ПЛК', sub: 'джиттер = цикл ПЛК' },
};
/** Задержка включения катушки после команды, мс (типичные значения из документации на ключи и реле). */
export const DRIVER: Record<Driver, { label: string; short: string; delayMs: number }> = {
  mosfet: { label: 'Транзисторный ключ', short: 'ключ MOSFET', delayMs: 0.01 },
  ssr: { label: 'Твердотельное реле', short: 'твердотельное реле', delayMs: 0.5 },
  relay: { label: 'Электромеханическое реле', short: 'электромех. реле', delayMs: 8 },
};
export const DISP: Record<Displacement, string> = {
  laser: 'Лазерный триангуляционный',
  lvdt: 'LVDT (дифф. трансформатор)',
  inductive: 'Индуктивный концевик',
  none: 'Нет',
};
export const DISP_SHORT: Record<Displacement, string> = { laser: 'лазерный', lvdt: 'LVDT', inductive: 'концевик', none: '' };
export const REC: Record<Recorder, { label: string; fs: number; channels: number }> = {
  scope: { label: 'Осциллограф', fs: 1000, channels: 4 },
  daq: { label: 'Плата АЦП / DAQ', fs: 50, channels: 8 },
  plc: { label: 'Аналоговый вход ПЛК', fs: 1, channels: 4 },
};
const SOUND = 343; // м/с

export interface RigConfig {
  expectedMs: number;
  pulse: Pulse;
  plcScanMs: number;
  driver: Driver;
  current: boolean;
  pressure: boolean;
  pressureResp: number;
  tubeCm: number;
  disp: Displacement;
  laserKHz: number;
  lvdtHz: number;
  recorder: Recorder;
  fsKHz: number;
  channels: number;
}

export interface Note {
  level: Level;
  text: string;
  target?: Target;
}

export interface LatencyRow {
  key: string;
  label: string;
  ms: number;
  /** random — случайная (входит в ±), bias — систематический сдвиг, measured — то, что измеряем, off — не влияет */
  kind: 'random' | 'bias' | 'measured' | 'off';
  target: Target;
  hint: string;
}

export interface SignalSlot {
  key: 'cmd' | 'x' | 'p';
  label: string;
  channel: number;
  recorded: boolean;
}

export const analyze = (c: RigConfig) => {
  // ---- бюджет погрешности измерения tполн (предельные значения, сумма — RSS) ----
  const t0Error = c.current ? 0.005 : c.pulse === 'gen' ? 0.001 : c.pulse === 'mcu' ? 0.02 : c.plcScanMs;
  const sampleMs = 1 / c.fsKHz;
  const dispError =
    c.disp === 'laser' ? 1 / c.laserKHz : c.disp === 'lvdt' ? 1000 / (2 * Math.PI * c.lvdtHz) : c.disp === 'inductive' ? 0.5 : 0;
  const budget = [
    {
      label: c.current ? 't0 по фронту тока катушки' : `t0 по команде (${PULSE[c.pulse].label.toLowerCase()})`,
      value: t0Error,
      c: COLORS.amber,
      target: (c.current ? 'current' : 'pulse') as Target,
    },
    { label: `Дискретизация, ${c.fsKHz} кГц (два фронта)`, value: sampleMs * Math.SQRT2, c: COLORS.green, target: 'recorder' as Target },
    ...(c.disp !== 'none'
      ? [{ label: `Датчик перемещения: ${DISP[c.disp].toLowerCase()}`, value: dispError, c: COLORS.violet, target: 'disp' as Target }]
      : []),
  ];
  const total = Math.sqrt(budget.reduce((sum, item) => sum + item.value ** 2, 0));

  // систематический сдвиг: при t0 по команде в результат входит задержка драйвера
  const driverDelay = DRIVER[c.driver].delayMs;
  const bias = c.current ? 0 : driverDelay;
  const randomShare = (total / c.expectedMs) * 100;
  // оценка сверху: случайная часть плюс сдвиг — так «отлично» не появится при реле на 8 мс
  const share = ((total + bias) / c.expectedMs) * 100;
  const biasDominates = bias > total;
  const verdict =
    c.disp === 'none'
      ? { c: COLORS.red, title: 'нельзя', text: 'Без датчика перемещения время движения и момент упора не измерить.' }
      : biasDominates && share > 1
        ? {
            c: share <= 5 ? COLORS.amber : COLORS.red,
            title: `+${share.toFixed(share < 10 ? 1 : 0)}%`,
            text: `Случайная часть всего ±${randomShare.toFixed(2)}%, но драйвер сдвигает каждый результат на +${bias < 0.1 ? bias.toFixed(3) : bias.toFixed(2)} мс. Возьмите транзисторный ключ или t0 по току катушки.`,
          }
        : share <= 1
        ? { c: COLORS.green, title: `±${share.toFixed(2)}%`, text: 'Отлично: погрешность меньше 1% от ожидаемого времени.' }
        : share <= 5
          ? { c: COLORS.amber, title: `±${share.toFixed(1)}%`, text: 'Приемлемо для учебного стенда; для исследования лучше уложиться в 1%.' }
          : { c: COLORS.red, title: `±${share.toFixed(0)}%`, text: 'Погрешность велика: результат будет определяться приборами, а не распределителем.' };

  // ---- задержки ----
  const tubeDelay = (c.tubeCm / 100 / SOUND) * 1000;
  const pressureLag = c.pressureResp + tubeDelay;

  // ---- каналы регистратора ----
  const wanted: Omit<SignalSlot, 'channel' | 'recorded'>[] = [
    { key: 'cmd', label: c.current ? 'Ток катушки' : 'Команда' },
    ...(c.disp !== 'none' ? [{ key: 'x' as const, label: 'Перемещение' }] : []),
    ...(c.pressure ? [{ key: 'p' as const, label: 'Давление' }] : []),
  ];
  const signals: SignalSlot[] = wanted.map((s, i) => ({ ...s, channel: i + 1, recorded: i + 1 <= c.channels }));

  // ---- рекомендации ----
  const notes: Note[] = [];
  if (c.disp === 'none')
    notes.push({ level: 'err', target: 'disp', text: 'Нет датчика перемещения: tдвиж и момент упора не определить. Добавьте лазерный датчик или LVDT.' });
  if (c.disp === 'inductive')
    notes.push({ level: 'warn', target: 'disp', text: 'Индуктивный концевик фиксирует только конечное положение: кривой разгона и порогов 10/90% хода не будет.' });
  if (c.disp === 'laser' && dispError > c.expectedMs / 50)
    notes.push({
      level: 'warn',
      target: 'disp',
      text: `Лазерный датчик ${c.laserKHz} кГц даёт точку раз в ${dispError.toFixed(3)} мс — для ${c.expectedMs} мс нужно не меньше ${Math.ceil(50 / c.expectedMs)} кГц.`,
    });
  if (c.disp === 'lvdt' && dispError > c.expectedMs / 20)
    notes.push({
      level: 'warn',
      target: 'disp',
      text: `Полоса LVDT ${c.lvdtHz} Гц даёт запаздывание ≈ ${dispError.toFixed(2)} мс — это заметно на фоне ${c.expectedMs} мс.`,
    });
  if (c.pressure && c.tubeCm > 10)
    notes.push({
      level: 'warn',
      target: 'tube',
      text: `Длина трубки от датчика давления до распределителя ${c.tubeCm} см превышает 10 см — это исказит показания времени задержки: волна давления идёт ${tubeDelay.toFixed(2)} мс, а объём трубки сглаживает фронт. Поставьте датчик прямо на порт.`,
    });
  if (c.pressure && c.pressureResp > c.expectedMs / 10)
    notes.push({
      level: 'warn',
      target: 'pressure',
      text: `Время отклика датчика давления ${c.pressureResp} мс сопоставимо с измеряемым временем: выберите датчик быстрее ${(c.expectedMs / 10).toFixed(1)} мс.`,
    });
  if (!c.current && c.pulse === 'plc')
    notes.push({
      level: 'warn',
      target: 'pulse',
      text: `Команда от ПЛК приходит с джиттером до цикла сканирования (${c.plcScanMs} мс). Регистрируйте t0 по току катушки, а не по моменту команды.`,
    });
  if (!c.current && bias > c.expectedMs / 100)
    notes.push({
      level: 'warn',
      target: 'driver',
      text: `${DRIVER[c.driver].label} включает катушку через ≈ ${driverDelay} мс после команды — это ${((bias / c.expectedMs) * 100).toFixed(0)}% от ${c.expectedMs} мс, и стенд прибавит их к времени распределителя. Возьмите транзисторный ключ или t0 по току катушки.`,
    });
  if (!c.current)
    notes.push({
      level: 'info',
      target: 'current',
      text: 't0 берётся по сигналу команды: в результат войдёт задержка драйвера или реле. Шунт или датчик тока в цепи катушки даст t0 по фронту тока.',
    });
  if (sampleMs > c.expectedMs / 100)
    notes.push({
      level: 'warn',
      target: 'recorder',
      text: `Шаг дискретизации ${sampleMs.toFixed(3)} мс больше 1% от ${c.expectedMs} мс. Нужно не меньше ${Math.ceil(100 / c.expectedMs)} кГц на канал.`,
    });
  if (c.recorder === 'plc')
    notes.push({ level: 'err', target: 'recorder', text: 'Аналоговый вход ПЛК обновляется раз в цикл — для миллисекундных измерений он не подходит.' });
  if (signals.length > c.channels)
    notes.push({
      level: 'err',
      target: 'recorder',
      text: `Сигналов ${signals.length}, а каналов у регистратора ${c.channels}: выберите регистратор с бо́льшим числом каналов или уберите датчик.`,
    });
  if (notes.every((note) => note.level === 'info' || note.level === 'ok'))
    notes.push({ level: 'ok', text: 'Конфигурация подходит для измерения времени срабатывания с заданной точностью.' });

  // ---- где теряются миллисекунды ----
  const latency: LatencyRow[] = [
    {
      key: 't0',
      label: c.current ? 'Фронт тока катушки' : `Джиттер команды (${PULSE[c.pulse].label.toLowerCase()})`,
      ms: t0Error,
      kind: 'random',
      target: c.current ? 'current' : 'pulse',
      hint: 'разброс момента t0 от цикла к циклу',
    },
    {
      key: 'driver',
      label: `Драйвер: ${DRIVER[c.driver].short}`,
      ms: driverDelay,
      kind: c.current ? 'off' : 'bias',
      target: 'driver',
      hint: c.current ? 't0 по току — задержка драйвера в результат не входит' : 'прибавляется к каждому измерению',
    },
    { key: 'valve', label: 'Распределитель (то, что измеряем)', ms: c.expectedMs, kind: 'measured', target: 'valve', hint: 'ожидаемое tполн' },
    ...(c.disp !== 'none'
      ? [{ key: 'disp', label: `Датчик перемещения: ${DISP_SHORT[c.disp]}`, ms: dispError, kind: 'random' as const, target: 'disp' as Target, hint: 'запаздывание или шаг датчика хода' }]
      : []),
    ...(c.pressure
      ? [
          { key: 'tube', label: `Трубка ${c.tubeCm} см`, ms: tubeDelay, kind: 'bias' as const, target: 'tube' as Target, hint: 'волна давления до датчика' },
          { key: 'pressure', label: 'Датчик давления', ms: c.pressureResp, kind: 'bias' as const, target: 'pressure' as Target, hint: 'сдвигает только кривую давления' },
        ]
      : []),
    { key: 'sample', label: `Шаг регистратора, ${c.fsKHz} кГц`, ms: sampleMs, kind: 'random', target: 'recorder', hint: 'момент порога попадает между отсчётами' },
  ];

  return {
    t0Error,
    sampleMs,
    dispError,
    budget,
    total,
    share,
    verdict,
    driverDelay,
    bias,
    tubeDelay,
    pressureLag,
    signals,
    notes,
    latency,
  };
};

export type RigAnalysis = ReturnType<typeof analyze>;
