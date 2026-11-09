import React from 'react';
import { FaPlay, FaPowerOff, FaRotateRight } from 'react-icons/fa6';
import { Status } from '../../launchTypes';

interface ControlPanelProps {
  status: Status | null;
  count: number;
  pressure: number;
  temperature: number;
  flow: number;
  position: number;
  velocity: number;
  responseTimeMs: number | null;
  energy: number;
  errors: string[];
  warnings: string[];
  history: string[];
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  status,
  count,
  pressure,
  temperature,
  flow,
  position,
  velocity,
  responseTimeMs,
  energy,
  errors,
  warnings,
  history,
  onStart,
  onStop,
  onReset,
}) => {
  const metrics = [
    { label: 'Давление питания', value: pressure.toFixed(1), unit: 'кПа', progress: pressure / 6.2 },
    { label: 'Температура воздуха', value: temperature.toFixed(1), unit: '°C', progress: temperature * 2.6 },
    { label: 'Расход', value: flow.toFixed(2), unit: 'м³/ч', progress: flow * 14 },
    { label: 'Положение золотника', value: position.toFixed(1), unit: '%', progress: position },
    { label: 'Скорость золотника', value: velocity.toFixed(1), unit: 'мм/с', progress: Math.abs(velocity) * 5 },
    { label: 'Энергия сжатого воздуха', value: (energy * 1000).toFixed(3), unit: 'Вт·ч', progress: energy * 1000 * 50 },
  ];
  const isStarted = status === Status.STARTED;

  return (
    <div className='card ctl' style={{ '--acc': isStarted ? '#44C18A' : '#7A788F' } as React.CSSProperties}>
      <div className='ctl-mode'>
        <div>
          <p className='kicker'>Режим установки</p>
          <b>{status ?? '—'}</b>
        </div>
        <span className='tag'>
          <i />
          {isStarted ? 'активно' : 'ожидание'}
        </span>
      </div>

      <div className='ctl-btns'>
        <button type='button' className='btn btn-go' disabled={isStarted} onClick={onStart}>
          <FaPlay aria-hidden /> Запуск
        </button>
        <button type='button' className='btn btn-stop' disabled={!isStarted} onClick={onStop}>
          <FaPowerOff aria-hidden /> Стоп
        </button>
        <button type='button' className='btn btn-ghost' onClick={onReset} aria-label='Сброс'>
          <FaRotateRight aria-hidden />
        </button>
      </div>

      <div className='stats ctl-stats' style={{ '--cols': 2 } as React.CSSProperties}>
        <div className='stat'>
          <span>Запуск №</span>
          <b>{count}</b>
          <em>в этой серии</em>
        </div>
        <div className='stat hi' style={{ '--acc': '#1FB6CE' } as React.CSSProperties}>
          <span><i className='sym'>tср</i> последнее</span>
          <b>
            {responseTimeMs ?? '—'}
            <small>мс</small>
          </b>
          <em>до 90/10% хода</em>
        </div>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className='alerts' role='alert'>
          {errors.map((error) => (
            <div key={error} className='alert err'>{error}</div>
          ))}
          {warnings.map((warning) => (
            <div key={warning} className='alert warn'>{warning}</div>
          ))}
        </div>
      )}

      <ul className='meters'>
        {metrics.map((metric) => (
          <li key={metric.label} className='meter'>
            <div className='meter-row'>
              {metric.label}
              <b>
                {metric.value} {metric.unit}
              </b>
            </div>
            <div className='meter-bar'>
              <i style={{ width: `${Math.min(Math.max(metric.progress, 0), 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <div className='ctl-log'>
        <p className='kicker' style={{ marginBottom: 8 }}>Журнал событий</p>
        <ol className='log'>
          {history.length === 0 && <li className='empty'>Событий пока нет — нажмите «Запуск»</li>}
          {history
            .slice(-8)
            .reverse()
            .map((entry, index) => (
              <li key={`${entry}-${index}`}>
                <span>{String(history.length - index).padStart(2, '0')}</span>
                {entry}
              </li>
            ))}
        </ol>
      </div>
    </div>
  );
};

export default ControlPanel;
