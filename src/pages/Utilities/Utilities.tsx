import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { AXIS, COLORS, GRID, TOOLTIP } from '../../lib/chartSetup';
import { NumField, PageHead, Seg, Slider } from '../../components/Fields';
import { FLOW_UNITS, FlowUnit, convertFlow, lineDrop } from '../../lib/pneumatics';
import { DEFAULT_PARAMS, simulate } from '../../lib/valveModel';

const fmt = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
};

const Utilities: React.FC = () => {
  // ---- конвертер пропускной способности ----
  const [unit, setUnit] = useState<FlowUnit>('qn');
  const [value, setValue] = useState<number | ''>(600);
  const [b, setB] = useState(0.3);
  const converted = convertFlow(value === '' ? 0 : value, unit, b);

  // ---- падение давления в линии ----
  const [p1Bar, setP1Bar] = useState(6);
  const [flow, setFlow] = useState(150);
  const [length, setLength] = useState(3);
  const [diameter, setDiameter] = useState(4);
  const line = lineDrop({ p1Bar, flowNlMin: flow, lengthM: length, diameterMm: diameter });

  const switching = useMemo(() => {
    const before = simulate({ ...DEFAULT_PARAMS, supplyBar: p1Bar }, false);
    const after = simulate({ ...DEFAULT_PARAMS, supplyBar: Math.max(line.p2Bar, 0) }, false);
    return { before, after };
  }, [p1Bar, line.p2Bar]);

  const lengths = Array.from({ length: 21 }, (_, i) => 0.5 * i);
  const curve = lengths.map((l) => {
    const r = lineDrop({ p1Bar, flowNlMin: flow, lengthM: Math.max(l, 0.01), diameterMm: diameter });
    return { x: l, y: r.ok ? +r.dpBar.toFixed(4) : null };
  });
  const chartData: ChartData<'line', { x: number; y: number | null }[]> = {
    datasets: [
      {
        label: 'Текущая длина',
        data: line.ok ? [{ x: length, y: +line.dpBar.toFixed(4) }] : [],
        borderColor: COLORS.ink,
        backgroundColor: COLORS.amber,
        pointRadius: 7,
        pointBorderWidth: 3,
        showLine: false,
      },
      {
        label: 'Δp, бар',
        data: curve,
        borderColor: COLORS.amber,
        backgroundColor: 'rgba(242,180,60,0.1)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.25,
      },
    ],
  };
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'nearest', axis: 'x' },
    plugins: { legend: { display: false }, tooltip: TOOLTIP },
    scales: {
      x: { type: 'linear', min: 0, max: 10, title: { display: true, text: 'длина линии, м' }, grid: { color: GRID }, border: { color: AXIS } },
      y: { min: 0, title: { display: true, text: 'Δp, бар' }, grid: { color: GRID }, border: { display: false } },
    },
  };

  const { before, after } = switching;
  const slowdown = before.ok && after.ok ? after.tTotal - before.tTotal : null;
  const lineNotes: { level: string; text: string }[] = [];
  if (!line.ok) lineNotes.push({ level: 'err', text: 'Линия не пропустит такой расход: давление на выходе падает больше чем вдвое. Увеличьте диаметр или сократите длину.' });
  if (line.ok && line.velocity > 20)
    lineNotes.push({ level: 'warn', text: `Скорость воздуха ${line.velocity.toFixed(0)} м/с — выше рекомендуемых 10–20 м/с: растут потери и шум.` });
  if (line.ok && line.dpBar > p1Bar * 0.1 + 0.1)
    lineNotes.push({ level: 'warn', text: `Потеря ${line.dpBar.toFixed(2)} бар — больше 10% давления питания. На пилот приходит меньше давления, переключение замедляется.` });
  if (line.ok && lineNotes.length === 0) lineNotes.push({ level: 'ok', text: 'Линия подобрана с запасом: потери и скорость в норме.' });

  return (
    <>
      <PageHead num='05' kicker='Пневматические утилиты' title={<>Проводимость и <span className='grad'>потери в линии</span></>}>
        Пересчёт пропускной способности между Cv, Kv, Qn и C и расчёт падения давления в подводящей
        линии — с оценкой того, насколько линия замедлит переключение распределителя.
      </PageHead>

      <section className='act'>
        <div className='wrap'>
          <div className='head2'>
            <p className='kicker'>
              <b>I</b> · Конвертер проводимости
            </p>
            <div className='head2-row'>
              <h2 className='h2x'>Cv · Kv · Qn · C</h2>
              <p className='sub2'>
                Введите одну величину — остальные пересчитаются через номинальный расход при 6 бар на входе и перепаде 1 бар.
              </p>
            </div>
          </div>
          <div className='two'>
            <div className='card'>
              <div className='fields'>
                <div className='field'>
                  <label>Исходная величина</label>
                  <Seg label='Исходная величина' value={unit} onChange={setUnit} options={(Object.keys(FLOW_UNITS) as FlowUnit[]).map((k) => ({ value: k, label: FLOW_UNITS[k].label }))} />
                </div>
                <NumField label={`${FLOW_UNITS[unit].label}, ${FLOW_UNITS[unit].unit}`} value={value} step={unit === 'qn' ? 10 : 0.01} onChange={setValue} />
                <p className='field-hint'>{FLOW_UNITS[unit].hint}</p>
                <Slider
                  label={<>Критическое отношение давлений <i className='sym'>b</i></>}
                  value={b}
                  min={0.1}
                  max={0.6}
                  step={0.01}
                  digits={2}
                  onChange={setB}
                  hint='Из даташита по ISO 6358; если не указано, обычно берут 0.3'
                />
              </div>
            </div>
            <div className='stack'>
              <div className='stats' style={{ '--cols': 2 } as React.CSSProperties}>
                {(['cv', 'kv', 'qn', 'c'] as FlowUnit[]).map((key) => (
                  <div key={key} className={`stat ${key === unit ? 'hi' : ''}`}>
                    <span>{FLOW_UNITS[key].label}</span>
                    <b>
                      {fmt(converted[key])}
                      <small>{FLOW_UNITS[key].unit}</small>
                    </b>
                    <em>{FLOW_UNITS[key].hint}</em>
                  </div>
                ))}
              </div>
              <ul className='kv card'>
                <li>Эффективная площадь S ≈ 5·C<b>{fmt(converted.s)} мм²</b></li>
                <li>Cv / Kv<b>1.156</b></li>
                <li>Qn / Kv при 6 → 5 бар<b>≈ 1078</b></li>
              </ul>
              <p className='note'>Связь Cv и Kv с C зависит от b, поэтому пересчёт приблизительный. Для точных данных берите C и b из даташита.</p>
            </div>
          </div>
        </div>
      </section>

      <section className='act'>
        <div className='wrap'>
          <div className='head2'>
            <p className='kicker'>
              <b>II</b> · Падение давления в линии
            </p>
            <div className='head2-row'>
              <h2 className='h2x'>Сколько давления теряет трубка</h2>
              <p className='sub2'>
                Формула Дарси–Вейсбаха для сжимаемого воздуха: трение ламинарное (64/Re) или турбулентное (Блазиус),
                плотность по среднему давлению в линии.
              </p>
            </div>
          </div>
          <div className='calc-grid'>
            <div className='card sticky'>
              <div className='fields'>
                <Slider label='Давление на входе' value={p1Bar} min={2} max={10} step={0.1} unit='бар' onChange={setP1Bar} />
                <Slider label='Расход' value={flow} min={10} max={1500} step={10} unit='нл/мин' digits={0} onChange={setFlow} />
                <Slider label='Длина линии' value={length} min={0.1} max={10} step={0.1} unit='м' onChange={setLength} />
                <Slider label='Внутренний диаметр' value={diameter} min={2} max={12} step={0.5} unit='мм' onChange={setDiameter} hint='Трубка 6×4 → 4 мм, 8×6 → 6 мм' />
              </div>
            </div>

            <div className='stack'>
              <div className='big-stats'>
                <div className='big main' style={{ '--teal': COLORS.amber } as React.CSSProperties}>
                  <span><i className='sym'>Δp</i> · потеря</span>
                  <b>
                    {line.ok ? line.dpBar.toFixed(3) : '—'}
                    <small>бар</small>
                  </b>
                  <em>{line.ok ? `${((line.dpBar / p1Bar) * 100).toFixed(1)}% от давления на входе` : 'расход не проходит'}</em>
                </div>
                <div className='big'>
                  <span><i className='sym'>p2</i> · на выходе</span>
                  <b>
                    {line.ok ? line.p2Bar.toFixed(2) : '—'}
                    <small>бар</small>
                  </b>
                  <em>избыточное</em>
                </div>
                <div className='big'>
                  <span><i className='sym'>v</i> · скорость</span>
                  <b>
                    {line.ok ? line.velocity.toFixed(1) : '—'}
                    <small>м/с</small>
                  </b>
                  <em>на выходе линии</em>
                </div>
              </div>

              <div className='alerts'>
                {lineNotes.map((note) => (
                  <div key={note.text} className={`alert ${note.level}`}>
                    {note.text}
                  </div>
                ))}
              </div>

              <div className='card' style={{ '--acc': COLORS.amber } as React.CSSProperties}>
                <div className='card-h'>
                  <div>
                    <h3 className='card-t'>Потеря давления по длине линии</h3>
                    <p className='card-s'>При текущих расходе и диаметре</p>
                  </div>
                </div>
                <div className='chart-box' style={{ height: 260 }}>
                  <Line data={chartData} options={chartOptions} />
                </div>
              </div>

              <div className='two'>
                <ul className='kv card'>
                  <li>Число Рейнольдса<b>{line.reynolds.toFixed(0)}</b></li>
                  <li>Режим течения<b>{line.regime}</b></li>
                  <li>Коэффициент трения λ<b>{line.frictionFactor.toFixed(4)}</b></li>
                  <li>Объём линии<b>{line.volumeCm3.toFixed(1)} см³</b></li>
                  <li>Пробег волны давления L/c<b>{line.waveMs.toFixed(2)} мс</b></li>
                </ul>
                <div className='card' style={{ '--acc': COLORS.teal } as React.CSSProperties}>
                  <p className='kicker' style={{ marginBottom: 10 }}>Влияние на быстродействие</p>
                  <ul className='kv'>
                    <li>tполн при {p1Bar.toFixed(1)} бар<b>{before.ok ? `${before.tTotal.toFixed(1)} мс` : '—'}</b></li>
                    <li>tполн при {line.ok ? line.p2Bar.toFixed(2) : '—'} бар<b>{after.ok ? `${after.tTotal.toFixed(1)} мс` : 'не переключится'}</b></li>
                    <li>Замедление<b>{slowdown !== null ? `+${slowdown.toFixed(2)} мс` : '—'}</b></li>
                  </ul>
                  <p className='card-s' style={{ marginTop: 10 }}>
                    Расчёт по модели из калькулятора с параметрами по умолчанию: пилот питается давлением после линии.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Utilities;
