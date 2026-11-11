import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { Link, useLocation } from 'react-router-dom';
import { AXIS, COLORS, GRID, TOOLTIP } from '../../lib/chartSetup';
import { Select } from '../Fields';
import { allValves, valveLabel } from '../../data/catalogStore';
import { CalibrationResult, calibrate, responseTimes } from '../../lib/calibration';
import { VALVE_CONST, ValveParams, simulate, simulateReturn } from '../../lib/valveModel';
import { useSetup } from '../../setup/useSetup';

/** давление по умолчанию, если в даташите условие не указано, бар изб. */
const DEFAULT_TEST_BAR = 6;
/** допустимое расхождение с даташитом, % */
const GOOD_FIT_PCT = 5;

type XY = { x: number; y: number };

const ms = (value: number | undefined) => (value === undefined ? '—' : `${value.toFixed(1)} мс`);
const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

/** Калибровка испытуемого распределителя: выбор здесь — это выбор распределителя для стенда. */
const Calibration: React.FC = () => {
  const { setup, calibrated, selectValve, applyCalibration } = useSetup();
  const { hash } = useLocation();
  const valves = useMemo(allValves, []);
  const valveId = setup.valveId ?? valves[0]?.id ?? '';
  const base = setup.params;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fit, setFit] = useState<{ valveId: string; result: CalibrationResult | null } | null>(null);

  useEffect(() => {
    if (hash === '#calibration') document.getElementById('calibration')?.scrollIntoView({ block: 'start' });
  }, [hash]);

  const valve = valves.find((item) => item.id === valveId);
  const testBar = valve?.testBar ?? DEFAULT_TEST_BAR;
  const current = useMemo(() => ({ ...base, supplyBar: testBar }), [base, testBar]);
  const before = useMemo(() => responseTimes(current), [current]);
  const result = fit && fit.valveId === valveId ? fit.result : null;
  const worstErr = result ? Math.max(Math.abs(result.errOnPct), Math.abs(result.errOffPct)) : null;
  const good = worstErr !== null && worstErr <= GOOD_FIT_PCT;

  const shown = result?.params ?? current;
  const curves = useMemo(() => ({ forward: simulate(shown), reverse: simulateReturn(shown) }), [shown]);
  const coilAndArmature = curves.forward.tCoil + curves.forward.tArmature;

  const applied =
    !!result &&
    calibrated &&
    setup.calibratedFor === valveId &&
    base.channelMm === result.params.channelMm &&
    base.springPreloadN === result.params.springPreloadN;

  const run = async () => {
    if (!valve || busy) return;
    if (!setup.valveId) selectValve(valve.id);
    setBusy(true);
    setProgress(0);
    const found = await calibrate(current, { onMs: valve.onMs, offMs: valve.offMs }, setProgress);
    setFit({ valveId: valve.id, result: found });
    setBusy(false);
  };

  const apply = () => {
    if (result && valve) applyCalibration(result.params, valve.id);
  };

  if (!valve) return null;

  const lastT = (series: { t: number }[]) => (series.length > 0 ? series[series.length - 1].t : 0);
  const chartMax = Math.ceil(
    Math.max(valve.onMs, valve.offMs, lastT(curves.forward.series), lastT(curves.reverse.series), 10) * 1.05
  );
  const vertical = (x: number): XY[] => [
    { x, y: 0 },
    { x, y: 100 },
  ];
  const level = (y: number): XY[] => [
    { x: 0, y },
    { x: chartMax, y },
  ];
  const data: ChartData<'line', XY[]> = {
    datasets: [
      {
        label: 'Модель: прямой ход, %',
        data: curves.forward.series.map((p) => ({ x: p.t, y: p.x })),
        borderColor: COLORS.teal,
        backgroundColor: 'rgba(31,182,206,0.10)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
      },
      {
        label: 'Модель: обратный ход, %',
        data: curves.reverse.series.map((p) => ({ x: p.t, y: p.x })),
        borderColor: COLORS.violet,
        backgroundColor: 'rgba(139,108,255,0.08)',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
      },
      { label: 'Даташит: tвкл', data: vertical(valve.onMs), borderColor: COLORS.teal, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
      { label: 'Даташит: tвыкл', data: vertical(valve.offMs), borderColor: COLORS.violet, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
      { label: 'Порог 90%', data: level(90), borderColor: COLORS.faint, borderDash: [3, 4], borderWidth: 1, pointRadius: 0 },
      { label: 'Порог 10%', data: level(10), borderColor: COLORS.faint, borderDash: [3, 4], borderWidth: 1, pointRadius: 0 },
    ],
  };
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'nearest', axis: 'x' },
    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP, filter: (item) => item.datasetIndex < 2 } },
    scales: {
      x: { type: 'linear', min: 0, max: chartMax, title: { display: true, text: 'время от команды, мс' }, grid: { color: GRID }, border: { color: AXIS } },
      y: { min: 0, max: 100, title: { display: true, text: 'x, % хода' }, grid: { color: GRID }, border: { display: false } },
    },
  };

  const preload = (p: ValveParams) => p.springPreloadN ?? VALVE_CONST.springPreloadN;

  return (
    <section className='act' id='calibration' style={{ scrollMarginTop: 'calc(var(--hdr) + 12px)' }}>
      <div className='wrap'>
        <div className='head2'>
          <p className='kicker'>Калибровка по даташиту</p>
          <div className='head2-row'>
            <h2 className='h2x'>Подогнать модель под реальный распределитель</h2>
            <p className='sub2'>
              Выберите модель из каталога — расчёт подберёт диаметр пилотного канала <i className='sym'>d</i> и натяг
              пружины <i className='sym'>F0</i> так, чтобы время включения и выключения совпало с даташитом. Канал
              задаёт общую скорость наполнения и стравливания, пружина — соотношение вкл/выкл.
            </p>
          </div>
        </div>

        <div className='two'>
          <div className='card' style={{ '--acc': COLORS.green } as React.CSSProperties}>
            <div className='fields'>
              <Select
                label='Испытуемый распределитель'
                value={valveId}
                onChange={selectValve}
                options={valves.map((item) => ({ value: item.id, label: valveLabel(item) }))}
              />
              <p className='card-s' style={{ marginTop: 0 }}>
                Этот же распределитель стоит на <Link to='/dashboard'>стенде</Link>, а его даташит — эталон в отчётах.{' '}
                {calibrated ? 'Модель уже подогнана под него.' : 'Модель под него ещё не подогнана.'}
              </p>
              <p className='card-s' style={{ marginTop: 0 }}>
                Давление при подборе — {testBar} бар
                {valve.testBar !== undefined ? ', как в условиях даташита.' : ': в даташите условие не указано, принято по умолчанию.'}{' '}
                Масса, ход, трение и напряжение берутся из параметров выше.
              </p>
              <div className='ctl-btns'>
                <button type='button' className='btn btn-light btn-sm' onClick={run} disabled={busy}>
                  {busy ? `Подбор… ${Math.round(progress * 100)}%` : 'Подобрать параметры'}
                </button>
                {result && good && (
                  <button type='button' className='btn btn-ghost btn-sm' onClick={apply} disabled={applied}>
                    {applied ? 'Применено к установке' : 'Применить к установке'}
                  </button>
                )}
              </div>
              {busy && (
                <div style={{ height: 4, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }} aria-hidden='true'>
                  <div style={{ width: `${progress * 100}%`, height: '100%', background: COLORS.green, transition: 'width .2s' }} />
                </div>
              )}
            </div>

            <div className='tbl-wrap' style={{ marginTop: 18 }}>
              <table className='tbl' style={{ minWidth: 420 }}>
                <thead>
                  <tr>
                    <th />
                    <th>Даташит</th>
                    <th>Модель сейчас</th>
                    <th>После подбора</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>tвкл, 90% хода</td>
                    <td className='num'>{ms(valve.onMs)}</td>
                    <td className='num'>{ms(before?.onMs)}</td>
                    <td className='num'>{result ? `${ms(result.onMs)} · ${pct(result.errOnPct)}` : '—'}</td>
                  </tr>
                  <tr>
                    <td>tвыкл, 10% хода</td>
                    <td className='num'>{ms(valve.offMs)}</td>
                    <td className='num'>{ms(before?.offMs)}</td>
                    <td className='num'>{result ? `${ms(result.offMs)} · ${pct(result.errOffPct)}` : '—'}</td>
                  </tr>
                  <tr>
                    <td>Канал d</td>
                    <td className='num'>—</td>
                    <td className='num'>{current.channelMm.toFixed(2)} мм</td>
                    <td className='num'>{result ? `${result.params.channelMm.toFixed(2)} мм` : '—'}</td>
                  </tr>
                  <tr>
                    <td>Пружина F0</td>
                    <td className='num'>—</td>
                    <td className='num'>{preload(current).toFixed(1)} Н</td>
                    <td className='num'>{result ? `${preload(result.params).toFixed(1)} Н` : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {fit && fit.valveId === valveId && !result && (
              <div className='alert err' style={{ marginTop: 14 }}>
                Подобрать не удалось: при этих параметрах модель не проходит полный ход. Проверьте давление и трение.
              </div>
            )}
            {result && good && (
              <div className='alert' style={{ marginTop: 14, borderColor: 'color-mix(in srgb, var(--green) 55%, transparent)' }}>
                Модель повторяет даташит: расхождение {worstErr !== null && worstErr < 0.1 ? 'меньше 0.1' : worstErr?.toFixed(1)}%
                ({result.evaluations} расчётов переключения).
              </div>
            )}
            {result && !good && (
              <div className='alert warn' style={{ marginTop: 14 }}>
                Модель не описывает этот распределитель: остаточное расхождение {worstErr?.toFixed(0)}%. Модель построена
                для золотникового распределителя с пилотным управлением — у неё одни катушка и якорь пилота занимают
                ≈ {coilAndArmature.toFixed(1)} мс.{valve.note ? ` По даташиту: ${valve.note}` : ''}
              </div>
            )}
            <p className='card-s' style={{ marginTop: 14 }}>
              Производители измеряют время переключения по своей методике, она может отличаться от нашей (90/10% хода
              золотника). Подбор приводит константы модели к реальным цифрам, но не заменяет измерение на стенде.
            </p>
          </div>

          <div className='card'>
            <div className='card-h'>
              <div>
                <h3 className='card-t'>{result ? 'Модель после подбора' : 'Модель сейчас'} и даташит</h3>
                <p className='card-s'>
                  {valve.maker} {valve.model}: кривые хода и времена из даташита
                </p>
              </div>
            </div>
            <div className='chart-box' style={{ height: 300 }}>
              <Line data={data} options={options} />
            </div>
            <div className='legend'>
              <span><i style={{ '--c': COLORS.teal } as React.CSSProperties} />прямой ход</span>
              <span><i style={{ '--c': COLORS.violet } as React.CSSProperties} />обратный ход</span>
              <span><i className='dash' style={{ '--c': COLORS.ink } as React.CSSProperties} />tвкл / tвыкл по даташиту</span>
            </div>
            <p className='card-s' style={{ marginTop: 12 }}>
              Если подбор удался, бирюзовая кривая пересекает 90% ровно на пунктире tвкл, а фиолетовая — 10% на пунктире tвыкл.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Calibration;
