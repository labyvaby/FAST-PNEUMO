import { NavLink } from 'react-router-dom';
import { useSetup } from './useSetup';
import { useLaunchContext } from '../useLaunchContext';
import './setupBar.css';

/** Полоса под шапкой: что сейчас стоит на стенде и сценарий эксперимента по шагам. */
const SetupBar = () => {
  const { valve, calibrated, label, line, regulatorBar, valveBar, setup } = useSetup();
  const { launches } = useLaunchContext();
  const runs = launches.filter((launch) => (launch.setup?.valveId ?? null) === (valve?.id ?? null)).length;

  const steps = [
    { to: '/catalog', title: 'Распределитель', value: valve ? label : 'не выбран', done: !!valve },
    {
      to: '/calculator#calibration',
      title: 'Калибровка',
      value: !valve ? 'нужен распределитель' : calibrated ? 'по даташиту' : 'не выполнена',
      done: calibrated,
    },
    {
      to: '/utilities',
      title: 'Линия',
      value: line.ok
        ? `${setup.line.lengthM} м × ${setup.line.diameterMm} мм · ${regulatorBar} → ${valveBar.toFixed(2)} бар`
        : 'не пропускает расход',
      done: line.ok,
    },
    { to: '/dashboard', title: 'Стенд', value: runs > 0 ? `запусков: ${runs}` : 'не запускался', done: runs > 0 },
    {
      to: '/reports',
      title: 'Отчёты',
      value: runs === 0 ? 'пока пусто' : valve ? 'сравнение с даташитом' : `запусков: ${runs}`,
      done: runs > 0,
    },
  ];

  return (
    <nav className='setup-bar' aria-label='Текущая установка и шаги эксперимента'>
      <div className='setup-bar-in'>
        <span className='setup-bar-k'>Установка</span>
        <ol>
          {steps.map((step, index) => (
            <li key={step.title}>
              <NavLink to={step.to} className={step.done ? 'done' : ''}>
                <i aria-hidden='true'>{step.done ? '✓' : index + 1}</i>
                <span>
                  <b>{step.title}</b>
                  {step.value}
                </span>
              </NavLink>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
};

export default SetupBar;
