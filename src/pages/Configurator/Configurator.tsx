import React, { useState } from 'react';
import { PageHead, Select, Slider } from '../../components/Fields';
import { COLORS } from '../../lib/chartSetup';

type Pulse = 'gen' | 'mcu' | 'plc';
type Displacement = 'laser' | 'lvdt' | 'inductive' | 'none';
type Recorder = 'scope' | 'daq' | 'plc';

const PULSE: Record<Pulse, { label: string; sub: string }> = {
  gen: { label: 'Генератор импульсов', sub: 'джиттер ≈ 1 мкс' },
  mcu: { label: 'Микроконтроллер', sub: 'джиттер ≈ 20 мкс' },
  plc: { label: 'ПЛК', sub: 'джиттер = цикл ПЛК' },
};
const DISP: Record<Displacement, string> = {
  laser: 'Лазерный триангуляционный',
  lvdt: 'LVDT (дифф. трансформатор)',
  inductive: 'Индуктивный концевик',
  none: 'Нет',
};
const DISP_SHORT: Record<Displacement, string> = { laser: 'лазерный', lvdt: 'LVDT', inductive: 'концевик', none: '' };
const REC: Record<Recorder, { label: string; fs: number; channels: number }> = {
  scope: { label: 'Осциллограф', fs: 1000, channels: 4 },
  daq: { label: 'Плата АЦП / DAQ', fs: 50, channels: 8 },
  plc: { label: 'Аналоговый вход ПЛК', fs: 1, channels: 4 },
};
const SOUND = 343; // м/с

type Level = 'err' | 'warn' | 'info' | 'ok';

const Configurator: React.FC = () => {
  const [expectedMs, setExpectedMs] = useState(10);
  const [pulse, setPulse] = useState<Pulse>('mcu');
  const [plcScanMs, setPlcScanMs] = useState(5);
  const [current, setCurrent] = useState(false);
  const [pressure, setPressure] = useState(true);
  const [pressureResp, setPressureResp] = useState(0.5);
  const [tubeCm, setTubeCm] = useState(25);
  const [disp, setDisp] = useState<Displacement>('laser');
  const [laserKHz, setLaserKHz] = useState(20);
  const [lvdtHz, setLvdtHz] = useState(1000);
  const [recorder, setRecorder] = useState<Recorder>('scope');
  const [fsKHz, setFsKHz] = useState(REC.scope.fs);
  const [channels, setChannels] = useState(REC.scope.channels);

  const chooseRecorder = (value: Recorder) => {
    setRecorder(value);
    setFsKHz(REC[value].fs);
    setChannels(REC[value].channels);
  };

  // ---- бюджет погрешности измерения tполн (предельные значения, сумма — RSS) ----
  const t0Error = current ? 0.005 : pulse === 'gen' ? 0.001 : pulse === 'mcu' ? 0.02 : plcScanMs;
  const sampleMs = 1 / fsKHz;
  const dispError =
    disp === 'laser' ? 1 / laserKHz : disp === 'lvdt' ? 1000 / (2 * Math.PI * lvdtHz) : disp === 'inductive' ? 0.5 : 0;
  const budget = [
    { label: current ? 't0 по фронту тока катушки' : `t0 по команде (${PULSE[pulse].label.toLowerCase()})`, value: t0Error, c: COLORS.amber },
    { label: `Дискретизация, ${fsKHz} кГц (два фронта)`, value: sampleMs * Math.SQRT2, c: COLORS.green },
    ...(disp !== 'none' ? [{ label: `Датчик перемещения: ${DISP[disp].toLowerCase()}`, value: dispError, c: COLORS.violet }] : []),
  ];
  const total = Math.sqrt(budget.reduce((sum, item) => sum + item.value ** 2, 0));
  const share = (total / expectedMs) * 100;
  const verdict =
    disp === 'none'
      ? { c: COLORS.red, title: 'нельзя', text: 'Без датчика перемещения время движения и момент упора не измерить.' }
      : share <= 1
        ? { c: COLORS.green, title: `±${share.toFixed(2)}%`, text: 'Отлично: погрешность меньше 1% от ожидаемого времени.' }
        : share <= 5
          ? { c: COLORS.amber, title: `±${share.toFixed(1)}%`, text: 'Приемлемо для учебного стенда; для исследования лучше уложиться в 1%.' }
          : { c: COLORS.red, title: `±${share.toFixed(0)}%`, text: 'Погрешность велика: результат будет определяться приборами, а не распределителем.' };

  // ---- датчик давления на трубке ----
  const tubeDelay = tubeCm / 100 / SOUND * 1000;
  const pressureLag = pressureResp + tubeDelay;

  // ---- каналы регистратора ----
  const signals = [
    { key: 'cmd', label: current ? 'Ток катушки' : 'Команда', always: true },
    ...(disp !== 'none' ? [{ key: 'x', label: 'Перемещение', always: false }] : []),
    ...(pressure ? [{ key: 'p', label: 'Давление', always: false }] : []),
  ];
  const channelOf = (key: string) => signals.findIndex((s) => s.key === key) + 1;

  // ---- правила и рекомендации ----
  const notes: { level: Level; text: string }[] = [];
  if (disp === 'none') notes.push({ level: 'err', text: 'Нет датчика перемещения: tдвиж и момент упора не определить. Добавьте лазерный датчик или LVDT.' });
  if (disp === 'inductive')
    notes.push({ level: 'warn', text: 'Индуктивный концевик фиксирует только конечное положение: кривой разгона и порогов 10/90% хода не будет.' });
  if (disp === 'laser' && dispError > expectedMs / 50)
    notes.push({ level: 'warn', text: `Лазерный датчик ${laserKHz} кГц даёт точку раз в ${dispError.toFixed(3)} мс — для ${expectedMs} мс нужно не меньше ${Math.ceil(50 / expectedMs)} кГц.` });
  if (disp === 'lvdt' && dispError > expectedMs / 20)
    notes.push({ level: 'warn', text: `Полоса LVDT ${lvdtHz} Гц даёт запаздывание ≈ ${dispError.toFixed(2)} мс — это заметно на фоне ${expectedMs} мс.` });
  if (pressure && tubeCm > 10)
    notes.push({
      level: 'warn',
      text: `Длина трубки от датчика давления до распределителя ${tubeCm} см превышает 10 см — это исказит показания времени задержки: волна давления идёт ${tubeDelay.toFixed(2)} мс, а объём трубки сглаживает фронт. Поставьте датчик прямо на порт.`,
    });
  if (pressure && pressureResp > expectedMs / 10)
    notes.push({ level: 'warn', text: `Время отклика датчика давления ${pressureResp} мс сопоставимо с измеряемым временем: выберите датчик быстрее ${(expectedMs / 10).toFixed(1)} мс.` });
  if (!current && pulse === 'plc')
    notes.push({ level: 'warn', text: `Команда от ПЛК приходит с джиттером до цикла сканирования (${plcScanMs} мс). Регистрируйте t0 по току катушки, а не по моменту команды.` });
  if (!current)
    notes.push({ level: 'info', text: 't0 берётся по сигналу команды: в результат войдёт задержка драйвера или реле. Шунт или датчик тока в цепи катушки даст t0 по фронту тока.' });
  if (sampleMs > expectedMs / 100)
    notes.push({ level: 'warn', text: `Шаг дискретизации ${sampleMs.toFixed(3)} мс больше 1% от ${expectedMs} мс. Нужно не меньше ${Math.ceil(100 / expectedMs)} кГц на канал.` });
  if (recorder === 'plc') notes.push({ level: 'err', text: 'Аналоговый вход ПЛК обновляется раз в цикл — для миллисекундных измерений он не подходит.' });
  if (signals.length > channels)
    notes.push({ level: 'err', text: `Сигналов ${signals.length}, а каналов у регистратора ${channels}: выберите регистратор с бо́льшим числом каналов или уберите датчик.` });
  if (notes.every((note) => note.level === 'info' || note.level === 'ok'))
    notes.push({ level: 'ok', text: 'Конфигурация подходит для измерения времени срабатывания с заданной точностью.' });

  // ---- геометрия схемы ----
  const recX = 820;
  const recLabelY = (key: string) => ({ cmd: 64, p: 446, x: 206 })[key] ?? 64;

  return (
    <>
      <PageHead num='04' kicker='Конфигуратор стенда' title={<>Соберите стенд — получите <span className='grad'>схему и погрешность</span></>}>
        Выберите приборы для эксперимента. Схема подключений строится автоматически, а под ней — бюджет
        погрешности измерения tполн и предупреждения о типичных ошибках сборки.
      </PageHead>

      <section className='act'>
        <div className='wrap calc-grid'>
          <div className='card sticky' style={{ maxHeight: 'calc(100vh - var(--hdr) - 32px)', overflowY: 'auto' }}>
            <div className='fields'>
              <Slider label={<>Ожидаемое <i className='sym'>tполн</i></>} value={expectedMs} min={2} max={100} step={1} unit='мс' digits={0} onChange={setExpectedMs} hint='Можно взять из калькулятора динамики' />

              <p className='kicker'>Управление</p>
              <Select label='Источник импульсов' value={pulse} onChange={setPulse} options={(Object.keys(PULSE) as Pulse[]).map((k) => ({ value: k, label: PULSE[k].label }))} />
              {pulse === 'plc' && <Slider label='Цикл ПЛК' value={plcScanMs} min={1} max={20} step={1} unit='мс' digits={0} onChange={setPlcScanMs} />}
              <div className='chips'>
                <button type='button' aria-pressed={current} onClick={() => setCurrent(!current)} style={{ '--acc': COLORS.amber } as React.CSSProperties}>
                  <i />
                  Датчик тока катушки
                </button>
                <button type='button' aria-pressed={pressure} onClick={() => setPressure(!pressure)} style={{ '--acc': COLORS.violet } as React.CSSProperties}>
                  <i />
                  Датчик давления
                </button>
              </div>

              {pressure && (
                <>
                  <p className='kicker'>Датчик давления</p>
                  <Slider label='Время отклика датчика' value={pressureResp} min={0.05} max={5} step={0.05} unit='мс' digits={2} onChange={setPressureResp} />
                  <Slider label='Длина трубки до распределителя' value={tubeCm} min={0} max={100} step={1} unit='см' digits={0} onChange={setTubeCm} />
                </>
              )}

              <p className='kicker'>Перемещение золотника</p>
              <Select label='Датчик перемещения' value={disp} onChange={setDisp} options={(Object.keys(DISP) as Displacement[]).map((k) => ({ value: k, label: DISP[k] }))} />
              {disp === 'laser' && <Slider label='Частота измерений' value={laserKHz} min={1} max={100} step={1} unit='кГц' digits={0} onChange={setLaserKHz} />}
              {disp === 'lvdt' && <Slider label='Полоса пропускания' value={lvdtHz} min={100} max={5000} step={100} unit='Гц' digits={0} onChange={setLvdtHz} />}

              <p className='kicker'>Регистрация</p>
              <Select label='Регистратор' value={recorder} onChange={chooseRecorder} options={(Object.keys(REC) as Recorder[]).map((k) => ({ value: k, label: REC[k].label }))} />
              <Slider label='Частота дискретизации' value={fsKHz} min={1} max={1000} step={1} unit='кГц' digits={0} onChange={setFsKHz} />
              <Select
                label='Каналов'
                value={String(channels)}
                onChange={(value) => setChannels(Number(value))}
                options={[
                  { value: '2', label: '2 канала' },
                  { value: '4', label: '4 канала' },
                  { value: '8', label: '8 каналов' },
                ]}
              />
            </div>
          </div>

          <div className='stack'>
            <div className='card'>
              <div className='card-h'>
                <div>
                  <h2 className='card-t'>Схема подключений</h2>
                  <p className='card-s'>Бирюзовый — воздух, жёлтый — управление, фиолетовый — измерительные сигналы</p>
                </div>
                <span className='tag' style={{ '--acc': signals.length > channels ? COLORS.red : COLORS.green } as React.CSSProperties}>
                  <i />
                  каналов {signals.length} / {channels}
                </span>
              </div>
              <div className='scheme-scroll'>
                <svg className='wiring' viewBox='0 0 980 500' role='img' aria-label='Схема подключений испытательного стенда' style={{ minWidth: 640 }}>
                  {/* воздух */}
                  <path className='air' d='M180 332 H215 M365 332 H400 M570 332 H610' />
                  {/* управление */}
                  <path className='ctl-line' d='M195 68 H235 M385 68 H485 V300' />
                  {/* сигналы на регистратор */}
                  <path className='sig' d={`M215 68 V24 H800 V${recLabelY('cmd')} H${recX}`} style={{ display: current ? 'none' : undefined }} />
                  {current && <path className='sig' d={`M560 172 H800 V${recLabelY('cmd')} H${recX}`} />}
                  {disp !== 'none' && <path className='sig' d={`M760 206 H${recX}`} />}
                  {disp !== 'none' && <path className='sig' d='M685 232 V300' strokeDasharray='4 4' />}
                  {pressure && <path className={`air ${tubeCm > 10 ? 'long' : ''}`} d='M485 364 V420' style={{ strokeWidth: 2.5 }} />}
                  {pressure && <path className='sig' d={`M570 446 H${recX}`} />}
                  {pressure && (
                    <text className={`lbl ${tubeCm > 10 ? 'bad' : ''}`} x='496' y='398'>
                      трубка {tubeCm} см
                    </text>
                  )}

                  <Block x={20} y={40} w={175} title={PULSE[pulse].label} sub={PULSE[pulse].sub} kind='ctl' />
                  <Block x={235} y={40} w={150} title='Драйвер / реле' sub='24 В на катушку' kind='ctl' />
                  {current && <Block x={410} y={148} w={150} h={48} title='Датчик тока' sub='шунт в цепи' kind='sensor' />}
                  <Block x={30} y={300} w={150} title='Компрессор' sub='питание P' />
                  <Block x={215} y={300} w={150} title='Подготовка' sub='фильтр, регулятор' />
                  <Block x={400} y={300} w={170} title='Распределитель 5/2' sub='испытуемый' />
                  <Block x={610} y={300} w={150} title='Цилиндр' sub='или нагрузка' />
                  {disp !== 'none' && <Block x={610} y={180} w={150} h={52} title='Датчик x' sub={DISP_SHORT[disp]} kind='sensor' />}
                  {pressure && <Block x={400} y={420} w={170} h={52} title='Датчик давления' sub={`отклик ${pressureResp} мс`} kind='sensor' />}

                  <g className='blk rec'>
                    <rect x={recX} y='40' width='140' height='440' rx='14' />
                    <text x={recX + 14} y='100'>{REC[recorder].label}</text>
                    <text className='sub' x={recX + 14} y='118'>{fsKHz} кГц · {channels} кан.</text>
                  </g>
                  {signals.map((signal) => (
                    <text key={signal.key} className='ch' x={recX + 14} y={recLabelY(signal.key) + 4} style={{ fill: channelOf(signal.key) > channels ? '#ff9a9d' : undefined }}>
                      CH{channelOf(signal.key)} · {signal.label.toLowerCase()}
                    </text>
                  ))}
                </svg>
              </div>
            </div>

            <div className='two'>
              <div className='card' style={{ '--acc': verdict.c } as React.CSSProperties}>
                <p className='kicker' style={{ marginBottom: 12 }}>Погрешность измерения <i className='sym'>tполн</i></p>
                <div className='verdict' style={{ '--c': verdict.c } as React.CSSProperties}>
                  <b>{verdict.title}</b>
                  <p>{verdict.text}</p>
                </div>
                <ul className='budget' style={{ marginTop: 18 }}>
                  {budget.map((item) => (
                    <li key={item.label}>
                      <div className='meter-row'>
                        {item.label}
                        <b>±{item.value < 0.1 ? item.value.toFixed(3) : item.value.toFixed(2)} мс</b>
                      </div>
                      <div className='meter-bar'>
                        <i style={{ width: `${Math.min(100, (item.value / Math.max(total, 1e-9)) * 100)}%`, '--c': item.c } as React.CSSProperties} />
                      </div>
                    </li>
                  ))}
                </ul>
                <ul className='kv' style={{ marginTop: 14 }}>
                  <li>Суммарно (корень из суммы квадратов)<b>±{total.toFixed(3)} мс</b></li>
                  {pressure && <li>Запаздывание кривой давления<b>{pressureLag.toFixed(2)} мс</b></li>}
                </ul>
              </div>

              <div className='stack'>
                <p className='kicker'>Рекомендации</p>
                <div className='alerts'>
                  {notes.map((note) => (
                    <div key={note.text} className={`alert ${note.level}`}>
                      {note.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

interface BlockProps {
  x: number;
  y: number;
  w: number;
  h?: number;
  title: string;
  sub: string;
  kind?: 'ctl' | 'sensor';
}

const Block: React.FC<BlockProps> = ({ x, y, w, h = 64, title, sub, kind }) => (
  <g className={`blk ${kind ?? ''}`}>
    <rect x={x} y={y} width={w} height={h} rx='12' />
    <text x={x + 12} y={y + h / 2 - 2}>{title}</text>
    <text className='sub' x={x + 12} y={y + h / 2 + 15}>{sub}</text>
  </g>
);

export default Configurator;
