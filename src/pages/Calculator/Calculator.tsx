import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { AXIS, COLORS, GRID, TOOLTIP } from '../../lib/chartSetup';
import { PageHead, Seg, Slider } from '../../components/Fields';
import Calibration from '../../components/Calibration/Calibration';
import { useSetup } from '../../setup/useSetup';
import {
  DEFAULT_PARAMS,
  SWEEPS,
  SweepKey,
  VALVE_CONST,
  ValveParams,
  simulate,
  sweep,
} from '../../lib/valveModel';

type XY = { x: number; y: number | null };

const fmt = (value: number) => (value >= 100 ? value.toFixed(0) : value.toFixed(1));

const Calculator: React.FC = () => {
  // параметры — общие для всей установки: стенд, утилиты и отчёты считают с ними же
  const { setup, label, calibrated, valveBar, updateParams } = useSetup();
  const params = setup.params;
  const [sweepKey, setSweepKey] = useState<SweepKey>('supplyBar');

  const result = useMemo(() => simulate(params), [params]);
  const sweepPoints = useMemo(() => sweep(params, sweepKey), [params, sweepKey]);
  const set = (key: keyof ValveParams) => (value: number) => updateParams({ [key]: value });

  const lastT = result.series.length > 0 ? result.series[result.series.length - 1].t : 20;
  const vertical = (t: number) => [
    { x: t, y: 0 },
    { x: t, y: 100 },
  ];

  const timeData: ChartData<'line', XY[]> = {
    datasets: [
      {
        label: 'Положение золотника, %',
        data: result.series.map((point) => ({ x: point.t, y: point.x })),
        borderColor: COLORS.teal,
        backgroundColor: 'rgba(31,182,206,0.12)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
        yAxisID: 'y1',
      },
      {
        label: 'Давление в пилотной камере, бар',
        data: result.series.map((point) => ({ x: point.t, y: point.p })),
        borderColor: COLORS.violet,
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'y',
      },
      {
        label: 'Давление питания, бар',
        data: [
          { x: 0, y: params.supplyBar },
          { x: lastT, y: params.supplyBar },
        ],
        borderColor: COLORS.faint,
        borderDash: [4, 4],
        borderWidth: 1,
        pointRadius: 0,
        yAxisID: 'y',
      },
      ...(result.ok
        ? [
            {
              label: 'Пилот открыт',
              data: vertical(result.tCoil + result.tArmature),
              borderColor: COLORS.amber,
              borderDash: [3, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              yAxisID: 'y1',
            },
            {
              label: 'Золотник тронулся (tзад)',
              data: vertical(result.tDelay),
              borderColor: COLORS.ink,
              borderDash: [3, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              yAxisID: 'y1',
            },
            {
              label: 'Упор (tполн)',
              data: vertical(result.tTotal),
              borderColor: COLORS.green,
              borderDash: [3, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              yAxisID: 'y1',
            },
          ]
        : []),
    ],
  };

  const timeOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'nearest', axis: 'x' },
    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP, filter: (item) => item.datasetIndex < 2 } },
    scales: {
      x: {
        type: 'linear',
        min: 0,
        max: Math.ceil(lastT),
        title: { display: true, text: 'время от команды, мс' },
        grid: { color: GRID },
        border: { color: AXIS },
      },
      y: {
        min: 0,
        max: 10,
        position: 'left',
        title: { display: true, text: 'p, бар изб.' },
        grid: { color: GRID },
        border: { display: false },
      },
      y1: {
        min: 0,
        max: 100,
        position: 'right',
        title: { display: true, text: 'x, % хода' },
        grid: { display: false },
        border: { display: false },
      },
    },
  };

  const sweepInfo = SWEEPS[sweepKey];
  const sweepData: ChartData<'line', XY[]> = {
    datasets: [
      {
        label: 'Текущие параметры',
        data: result.ok ? [{ x: params[sweepKey], y: +result.tTotal.toFixed(2) }] : [],
        borderColor: COLORS.ink,
        backgroundColor: COLORS.teal,
        pointRadius: 7,
        pointHoverRadius: 8,
        pointBorderWidth: 3,
        showLine: false,
      },
      {
        label: 'tполн, мс',
        data: sweepPoints,
        borderColor: COLORS.teal,
        backgroundColor: 'rgba(31,182,206,0.1)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: false,
      },
    ],
  };

  const sweepValues = sweepPoints.map((point) => point.y).filter((y): y is number => y !== null);
  const sweepOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'nearest', axis: 'x' },
    plugins: { legend: { display: false }, tooltip: TOOLTIP },
    scales: {
      x: {
        type: 'linear',
        min: sweepInfo.from,
        max: sweepInfo.to,
        title: { display: true, text: `${sweepInfo.label}, ${sweepInfo.unit}` },
        grid: { color: GRID },
        border: { color: AXIS },
      },
      y: {
        min: 0,
        suggestedMax: sweepValues.length > 0 ? Math.ceil(Math.max(...sweepValues) * 1.15) : 20,
        title: { display: true, text: 'tполн, мс' },
        grid: { color: GRID },
        border: { display: false },
      },
    },
  };

  const phases = [
    { label: 'ток катушки', value: result.tCoil, c: COLORS.amber },
    { label: 'ход якоря', value: result.tArmature, c: COLORS.violet },
    { label: 'наполнение', value: result.tFill, c: COLORS.blue },
    { label: 'движение', value: result.tMove, c: COLORS.teal },
  ];
  const lowVoltage = params.voltage < 24 * 0.9 && result.ok;
  const sweepRange =
    sweepValues.length > 1 ? `${fmt(Math.max(...sweepValues))} → ${fmt(Math.min(...sweepValues))} мс` : '—';

  return (
    <>
      <PageHead num='02' kicker='Калькулятор динамики' title={<>Сколько длится переключение — <span className='grad'>по фазам</span></>}>
        Двигайте ползунки: модель пересчитывает ток катушки, наполнение пилотной камеры и движение
        золотника и сразу показывает время задержки, время движения и полное время переключения.
      </PageHead>

      <section className='act'>
        <div className='wrap calc-grid'>
          <div className='card sticky'>
            <div className='card-h'>
              <div>
                <h2 className='card-t'>Параметры установки</h2>
                <p className='card-s'>
                  {label} · {calibrated ? 'подогнано под даташит' : 'без калибровки'}
                </p>
              </div>
              <button type='button' className='btn btn-ghost btn-sm' onClick={() => updateParams(DEFAULT_PARAMS)}>
                Сброс
              </button>
            </div>
            <div className='fields'>
              <p className='card-s' style={{ marginTop: 0 }}>
                Эти параметры использует стенд. Правка вручную снимает отметку о калибровке.
              </p>
              <Slider
                label={<>Давление на регуляторе <i className='sym'>P</i></>}
                value={params.supplyBar}
                min={2}
                max={10}
                step={0.1}
                unit='бар'
                hint={`На стенде после подводящей линии на распределитель придёт ${valveBar.toFixed(2)} бар — длина и диаметр линии задаются в Утилитах`}
                onChange={set('supplyBar')}
              />
              <Slider label={<>Масса золотника <i className='sym'>m</i></>} value={params.spoolMassG} min={5} max={50} step={1} unit='г' digits={0} onChange={set('spoolMassG')} />
              <Slider label={<>Ход золотника <i className='sym'>x</i></>} value={params.strokeMm} min={1} max={10} step={0.1} unit='мм' onChange={set('strokeMm')} />
              <Slider
                label={<>Диаметр пилотного канала <i className='sym'>d</i></>}
                value={params.channelMm}
                min={0.3}
                max={3}
                step={0.05}
                unit='мм'
                digits={2}
                onChange={set('channelMm')}
              />
              <Slider
                label={<>Коэффициент трения <i className='sym'>μ</i></>}
                value={params.friction}
                min={0.05}
                max={0.4}
                step={0.01}
                digits={2}
                hint='0.05–0.1 — металлическая пара, 0.15–0.3 — резиновые уплотнения'
                onChange={set('friction')}
              />
              <Slider
                label={<>Натяг пружины <i className='sym'>F0</i></>}
                value={params.springPreloadN ?? VALVE_CONST.springPreloadN}
                min={3}
                max={45}
                step={0.5}
                unit='Н'
                hint='Сильнее пружина — дольше включение и быстрее возврат'
                onChange={set('springPreloadN')}
              />
              <Slider
                label={<>Напряжение соленоида <i className='sym'>U</i></>}
                value={params.voltage}
                min={12}
                max={30}
                step={0.5}
                unit='В'
                hint={`Номинал 24 В, срабатывание ≈ ${result.uPullIn.toFixed(1)} В`}
                onChange={set('voltage')}
              />
            </div>
          </div>

          <div className='stack'>
            {!result.ok && <div className='alert err'>{result.reason}</div>}
            {lowVoltage && (
              <div className='alert warn'>
                Напряжение ниже номинала −10% (21.6 В): ток катушки нарастает дольше, задержка растёт.
              </div>
            )}

            <div className='big-stats'>
              <div className='big'>
                <span><i className='sym'>tзад</i> · задержка</span>
                <b>
                  {result.ok ? fmt(result.tDelay) : '—'}
                  <small>мс</small>
                </b>
                <em>от команды до страгивания</em>
              </div>
              <div className='big'>
                <span><i className='sym'>tдвиж</i> · движение</span>
                <b>
                  {result.ok ? fmt(result.tMove) : '—'}
                  <small>мс</small>
                </b>
                <em>ход {params.strokeMm.toFixed(1)} мм до упора</em>
              </div>
              <div className='big main'>
                <span><i className='sym'>tполн</i> · переключение</span>
                <b>
                  {result.ok ? fmt(result.tTotal) : '—'}
                  <small>мс</small>
                </b>
                <em>tзад + tдвиж</em>
              </div>
            </div>

            {result.ok && (
              <div className='card' style={{ '--acc': COLORS.amber } as React.CSSProperties}>
                <p className='kicker' style={{ marginBottom: 10 }}>Из чего складывается <i className='sym'>tполн</i></p>
                <div className='split' aria-hidden='true'>
                  {phases.map((phase) => (
                    <i key={phase.label} style={{ flexGrow: phase.value, '--c': phase.c } as React.CSSProperties} />
                  ))}
                </div>
                <div className='split-legend'>
                  {phases.map((phase) => (
                    <span key={phase.label}>
                      <i style={{ '--c': phase.c } as React.CSSProperties} />
                      {phase.label} <b>{phase.value.toFixed(2)} мс</b>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className='card'>
              <div className='card-h'>
                <div>
                  <h2 className='card-t'>Разгон золотника и давление в пилотной камере</h2>
                  <p className='card-s'>Пунктиры: открытие пилота, страгивание и упор</p>
                </div>
              </div>
              <div className='chart-box'>
                <Line data={timeData} options={timeOptions} />
              </div>
              <div className='legend'>
                <span><i style={{ '--c': COLORS.teal } as React.CSSProperties} />положение, %</span>
                <span><i style={{ '--c': COLORS.violet } as React.CSSProperties} />p пилота, бар</span>
                <span><i className='dash' style={{ '--c': COLORS.amber } as React.CSSProperties} />пилот открыт</span>
                <span><i className='dash' style={{ '--c': COLORS.ink } as React.CSSProperties} />страгивание</span>
                <span><i className='dash' style={{ '--c': COLORS.green } as React.CSSProperties} />упор</span>
              </div>
            </div>

            <div className='card' style={{ '--acc': COLORS.violet } as React.CSSProperties}>
              <div className='card-h'>
                <div>
                  <h2 className='card-t'>tполн в зависимости от {sweepInfo.label}</h2>
                  <p className='card-s'>
                    Остальные параметры как слева · по диапазону {sweepRange}
                  </p>
                </div>
                <Seg
                  label='Ось графика'
                  value={sweepKey}
                  onChange={setSweepKey}
                  options={[
                    { value: 'supplyBar', label: 'от P' },
                    { value: 'spoolMassG', label: 'от m' },
                  ]}
                />
              </div>
              <div className='chart-box' style={{ height: 280 }}>
                <Line data={sweepData} options={sweepOptions} />
              </div>
              {sweepKey === 'supplyBar' && (
                <p className='card-s'>
                  Левее {result.pMinBar.toFixed(2)} бар кривой нет: давления не хватает, чтобы довести золотник до упора.
                </p>
              )}
            </div>

            <div className='two'>
              <div className='card' style={{ '--acc': COLORS.green } as React.CSSProperties}>
                <p className='kicker' style={{ marginBottom: 10 }}>Модель</p>
                <ol className='steps'>
                  <li>
                    <p>
                      <b>Катушка.</b> i(t) = U/R·(1 − e<sup>−t/τ</sup>), τ = L/R. Якорь трогается при i = Iср.
                    </p>
                  </li>
                  <li>
                    <p>
                      <b>Пилотная камера.</b> Расход через канал d — критический или докритический режим, p = mRT/V.
                    </p>
                  </li>
                  <li>
                    <p>
                      <b>Золотник.</b> m·x″ = (p − pатм)·A − (F0 + k·x) − Fтр − c·x′, Fтр = μ·N.
                    </p>
                  </li>
                </ol>
              </div>
              <div className='card'>
                <p className='kicker' style={{ marginBottom: 10 }}>Принятые константы</p>
                <ul className='kv'>
                  <li>Диаметр золотника<b>{VALVE_CONST.spoolDiameterMm} мм</b></li>
                  <li>Пружина F0 / k<b>{params.springPreloadN ?? VALVE_CONST.springPreloadN} Н / {VALVE_CONST.springRateNmm} Н/мм</b></li>
                  <li>Поджатие уплотнений N<b>{VALVE_CONST.sealNormalForceN} Н</b></li>
                  <li>Объём пилотной камеры<b>{VALVE_CONST.pilotVolumeCm3} см³</b></li>
                  <li>Катушка R / L<b>{VALVE_CONST.coilResistanceOhm} Ом / {VALVE_CONST.coilInductanceH} Гн</b></li>
                  <li>Ток срабатывания<b>{VALVE_CONST.pullInCurrentA * 1000} мА</b></li>
                  <li>Ход якоря пилота<b>{VALVE_CONST.armatureTravelMs} мс</b></li>
                  <li>Мин. давление для полного хода<b>{result.pMinBar.toFixed(2)} бар</b></li>
                </ul>
                <p className='card-s' style={{ marginTop: 12 }}>
                  Константы — типичные порядки для малого распределителя. Для конкретной модели их нужно взять из даташита или измерить.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Calibration />
    </>
  );
};

export default Calculator;
