import React, { useEffect, useMemo, useState } from 'react';
import { FaPlay } from 'react-icons/fa6';
import { PageHead, Select, Slider } from '../../components/Fields';
import { COLORS } from '../../lib/chartSetup';
import { LatencyWaterfall } from './LatencyWaterfall';
import { RecordPreview } from './RecordPreview';
import { WiringScheme } from './WiringScheme';
import { DISP, DRIVER, Displacement, Driver, PULSE, Pulse, REC, Recorder, RigConfig, Target, analyze } from './rig';
import './configurator.scss';

const Configurator: React.FC = () => {
  const [expectedMs, setExpectedMs] = useState(10);
  const [pulse, setPulse] = useState<Pulse>('mcu');
  const [plcScanMs, setPlcScanMs] = useState(5);
  const [driver, setDriver] = useState<Driver>('mosfet');
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
  const [focus, setFocus] = useState<Target | null>(null);
  const [playKey, setPlayKey] = useState(0);

  const chooseRecorder = (value: Recorder) => {
    setRecorder(value);
    setFsKHz(REC[value].fs);
    setChannels(REC[value].channels);
  };

  const config: RigConfig = useMemo(
    () => ({ expectedMs, pulse, plcScanMs, driver, current, pressure, pressureResp, tubeCm, disp, laserKHz, lvdtHz, recorder, fsKHz, channels }),
    [expectedMs, pulse, plcScanMs, driver, current, pressure, pressureResp, tubeCm, disp, laserKHz, lvdtHz, recorder, fsKHz, channels]
  );
  const analysis = useMemo(() => analyze(config), [config]);
  const { budget, total, verdict, signals, notes, pressureLag, bias } = analysis;

  // импульс по схеме: при открытии и после каждой смены приборов (с паузой, чтобы не дёргать на ползунках)
  useEffect(() => {
    const id = window.setTimeout(() => setPlayKey((k) => k + 1), playKey === 0 ? 500 : 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const overflow = signals.some((s) => !s.recorded);

  return (
    <>
      <PageHead num='04' kicker='Конфигуратор стенда' title={<>Соберите стенд — получите <span className='grad'>схему и погрешность</span></>}>
        Выберите приборы для эксперимента. Схема подключений строится автоматически: по ней пробегает импульс
        с реальными задержками, ниже — что именно запишет регистратор, бюджет погрешности tполн и
        предупреждения о типичных ошибках сборки.
      </PageHead>

      <section className='act'>
        <div className='wrap calc-grid'>
          <div className='card sticky' style={{ maxHeight: 'calc(100vh - var(--hdr) - 32px)', overflowY: 'auto' }}>
            <div className='fields'>
              <Slider label={<>Ожидаемое <i className='sym'>tполн</i></>} value={expectedMs} min={2} max={100} step={1} unit='мс' digits={0} onChange={setExpectedMs} hint='Можно взять из калькулятора динамики' />

              <p className='kicker'>Управление</p>
              <Select label='Источник импульсов' value={pulse} onChange={setPulse} options={(Object.keys(PULSE) as Pulse[]).map((k) => ({ value: k, label: PULSE[k].label }))} />
              {pulse === 'plc' && <Slider label='Цикл ПЛК' value={plcScanMs} min={1} max={20} step={1} unit='мс' digits={0} onChange={setPlcScanMs} />}
              <Select
                label='Драйвер катушки'
                value={driver}
                onChange={setDriver}
                options={(Object.keys(DRIVER) as Driver[]).map((k) => ({ value: k, label: `${DRIVER[k].label} · ${DRIVER[k].delayMs < 1 ? DRIVER[k].delayMs * 1000 + ' мкс' : DRIVER[k].delayMs + ' мс'}` }))}
              />
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
                  <p className='card-s'>Бирюзовый — воздух, жёлтый — управление, фиолетовый — измерительные сигналы. Наведите на прибор — подробности и вклад в погрешность.</p>
                </div>
                <div className='cfg-head-actions'>
                  <span className='tag' style={{ '--acc': overflow ? COLORS.red : COLORS.green } as React.CSSProperties}>
                    <i />
                    каналов {signals.length} / {channels}
                  </span>
                  <button type='button' className='cfg-play' onClick={() => setPlayKey((k) => k + 1)}>
                    <FaPlay /> Пустить импульс
                  </button>
                </div>
              </div>
              <div className='scheme-scroll'>
                <WiringScheme config={config} analysis={analysis} focus={focus} onFocus={setFocus} playKey={playKey} />
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
                    <li
                      key={item.label}
                      className={`cfg-link ${focus && focus !== item.target ? 'is-dim' : ''} ${focus === item.target ? 'is-focus' : ''}`}
                      onMouseEnter={() => setFocus(item.target)}
                      onMouseLeave={() => setFocus(null)}
                    >
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
                  {bias > 0 && <li>Систематический сдвиг от драйвера<b>+{bias < 0.1 ? bias.toFixed(3) : bias.toFixed(2)} мс</b></li>}
                  {pressure && <li>Запаздывание кривой давления<b>{pressureLag.toFixed(2)} мс</b></li>}
                </ul>
              </div>

              <div className='stack'>
                <p className='kicker'>Рекомендации · наведите, чтобы найти на схеме</p>
                <div className='alerts'>
                  {notes.map((note) => (
                    <div
                      key={note.text}
                      className={`alert ${note.level} cfg-link ${note.target && focus && focus !== note.target ? 'is-dim' : ''} ${note.target && focus === note.target ? 'is-focus' : ''}`}
                      onMouseEnter={() => note.target && setFocus(note.target)}
                      onMouseLeave={() => setFocus(null)}
                    >
                      {note.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className='card' style={{ '--acc': COLORS.teal } as React.CSSProperties}>
              <div className='card-h'>
                <div>
                  <h2 className='card-t'>Что запишет регистратор</h2>
                  <p className='card-s'>
                    Одно переключение по физической модели, растянутое до ожидаемого tполн и пропущенное через выбранные приборы.
                    Нажимайте «Ещё запись» — увидите разброс от джиттера и фазы отсчётов.
                  </p>
                </div>
              </div>
              <RecordPreview config={config} analysis={analysis} focus={focus} onFocus={setFocus} />
            </div>

            <div className='card' style={{ '--acc': COLORS.amber } as React.CSSProperties}>
              <div className='card-h'>
                <div>
                  <h2 className='card-t'>Где теряются миллисекунды</h2>
                  <p className='card-s'>Каждое звено цепочки на логарифмической шкале. Всё, что правее отметки «1% tполн», заметно влияет на результат.</p>
                </div>
              </div>
              <LatencyWaterfall rows={analysis.latency} config={config} focus={focus} onFocus={setFocus} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Configurator;
