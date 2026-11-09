import { FC, useEffect, useState } from 'react';
import './styles.scss';
import { Status } from '../../launchTypes';
import { useLaunchContext } from '../../useLaunchContext';

interface SchemeProps {
  isToggled: boolean;
  position: number;
  pressure: number;
  flow: number;
}

export const Scheme: FC<SchemeProps> = ({
  isToggled,
  position,
  pressure,
  flow,
}) => {
  const [time, setTime] = useState(0);
  const { status } = useLaunchContext();
  const isRunning = status === Status.STARTED;
  const pistonX = 648 + position * 1.42;
  const rodEndX = pistonX + 156;
  const activePath = isToggled ? 'forward' : 'return';
  const activeSupplyPath =
    activePath === 'forward'
      ? 'M296 254 H362 M488 170 H620 V182'
      : 'M296 254 H362 M560 170 H732 V182';
  const activeExhaustPath =
    activePath === 'forward'
      ? 'M732 292 V344 H616'
      : 'M620 292 V344 H506';

  useEffect(() => {
    let interval: number | undefined;

    if (isRunning) {
      interval = window.setInterval(() => {
        setTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      setTime(0);
    }

    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (secondsTotal: number) => {
    const minutes = Math.floor(secondsTotal / 60);
    const seconds = secondsTotal % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className='mechanism'>
      <div className='mechanism__status'>
        <span className={`mechanism__lamp ${isRunning ? 'is-on' : ''}`} />
        <div>
          <b>{isRunning ? 'Пневмолиния под давлением' : 'Питание перекрыто'}</b>
          <span>
            {activePath === 'forward'
              ? 'Активно: P→A, выхлоп B→R'
              : 'Активно: P→B, выхлоп A→S'}
          </span>
        </div>
      </div>

      <svg
        className={`mechanism__svg ${isRunning ? 'is-running' : 'is-idle'}`}
        viewBox='0 0 960 540'
        role='img'
        aria-label='Схема пневматического золотникового распределителя'
      >
        <defs>
          <marker
            id='supplyArrow'
            markerWidth='18'
            markerHeight='14'
            refX='13'
            refY='6'
            orient='auto'
            markerUnits='userSpaceOnUse'
          >
            <path d='M0,0 L0,12 L16,6 z' className='marker-supply' />
          </marker>
          <marker
            id='exhaustArrow'
            markerWidth='14'
            markerHeight='12'
            refX='10'
            refY='5'
            orient='auto'
            markerUnits='userSpaceOnUse'
          >
            <path d='M0,0 L0,10 L13,5 z' className='marker-exhaust' />
          </marker>
          <marker
            id='signalArrow'
            markerWidth='14'
            markerHeight='12'
            refX='10'
            refY='5'
            orient='auto'
            markerUnits='userSpaceOnUse'
          >
            <path d='M0,0 L0,10 L13,5 z' className='marker-signal' />
          </marker>
          <linearGradient id='cylinderFill' x1='0' x2='1'>
            <stop offset='0%' stopColor='#0d1a24' />
            <stop offset='100%' stopColor='#0a0b14' />
          </linearGradient>
        </defs>

        <rect x='24' y='24' width='912' height='492' rx='22' className='panel' />
        <text x='54' y='70' className='title'>
          Пневматический золотниковый распределитель 5/2
        </text>
        <text x='54' y='98' className='subtitle'>
          Давление питания - расход - перемещение золотника - время срабатывания
        </text>

        <g className='legend'>
          <circle cx='54' cy='472' r='6' className='legend-supply' />
          <text x='68' y='477'>Подача</text>
          <circle cx='148' cy='472' r='6' className='legend-exhaust' />
          <text x='162' y='477'>Выхлоп</text>
          <circle cx='246' cy='472' r='6' className='legend-signal' />
          <text x='260' y='477'>Сигнал</text>
          <circle cx='340' cy='472' r='6' className='legend-passive' />
          <text x='354' y='477'>Неактивная линия</text>
        </g>

        <g className='compressor'>
          <rect x='56' y='206' width='122' height='104' rx='14' />
          <circle cx='100' cy='258' r='25' />
          <path d='M90 258 L112 245 L112 271 Z' />
          <text x='66' y='346' className='label'>Компрессор</text>
          <rect x='66' y='356' width='92' height='28' rx='14' className='value-badge' />
          <text x='78' y='375' className='mono-value'>{pressure.toFixed(0)} кПа</text>
        </g>

        <g className='filter'>
          <rect x='208' y='218' width='88' height='80' rx='12' />
          <line x1='226' y1='238' x2='278' y2='238' />
          <line x1='226' y1='258' x2='278' y2='258' />
          <line x1='226' y1='278' x2='278' y2='278' />
          <text x='220' y='326' className='label'>Фильтр</text>
        </g>

        <path className='pipe pipe-passive' d='M178 258 H208' />
        <path className='pipe pipe-supply is-active' d='M178 258 H208' />
        <path className='pipe pipe-passive' d='M296 258 H362' />
        <path className='pipe pipe-supply is-active' d='M296 258 H362' />

        <g className='valve' transform='translate(362 150)'>
          <rect x='0' y='0' width='228' height='196' rx='18' />
          <rect
            x='10'
            y='10'
            width='96'
            height='176'
            rx='12'
            className={!isToggled ? 'valve-cell active-cell' : 'valve-cell'}
          />
          <rect
            x='122'
            y='10'
            width='96'
            height='176'
            rx='12'
            className={isToggled ? 'valve-cell active-cell' : 'valve-cell'}
          />
          <line x1='114' y1='0' x2='114' y2='196' className='divider' />

          <text x='108' y='38' className='port-label'>A</text>
          <text x='178' y='38' className='port-label'>B</text>
          <text x='36' y='112' className='port-label'>P</text>
          <text x='66' y='176' className='port-label'>S</text>
          <text x='178' y='176' className='port-label'>R</text>

          <path
            className={`internal-link ${!isToggled ? 'is-active' : ''}`}
            d='M42 106 C72 92, 84 62, 106 36'
          />
          <path
            className={`internal-link exhaust-link ${!isToggled ? 'is-active' : ''}`}
            d='M176 36 C150 72, 132 128, 72 166'
          />
          <path
            className={`internal-link ${isToggled ? 'is-active' : ''}`}
            d='M42 106 C94 94, 134 64, 178 36'
          />
          <path
            className={`internal-link exhaust-link ${isToggled ? 'is-active' : ''}`}
            d='M106 36 C96 76, 92 128, 178 166'
          />

          <rect
            x={isToggled ? 122 : 10}
            y='10'
            width='96'
            height='176'
            rx='12'
            className='spool-window'
          />
        </g>

        <path className='pipe pipe-passive' d='M470 150 V122 H620 V182' />
        <path className='pipe pipe-passive' d='M540 150 V112 H732 V182' />
        <path className='pipe pipe-passive' d='M620 292 V344 H506' />
        <path className='pipe pipe-passive' d='M732 292 V344 H616' />
        <path className='pipe pipe-supply is-active' d={activeSupplyPath} />
        <path className='pipe pipe-exhaust is-active' d={activeExhaustPath} />

        <g className='cylinder'>
          <rect x='620' y='182' width='248' height='110' rx='20' />
          <rect
            x='620'
            y='182'
            width={Math.max(16, position * 2.48)}
            height='110'
            rx='20'
            className='cylinder-air'
          />
          <line x1='744' y1='182' x2='744' y2='292' />
          <rect x={pistonX} y='198' width='30' height='78' rx='7' className='piston' />
          <line x1={pistonX + 30} y1='237' x2={rodEndX} y2='237' className='rod' />
          <text x='648' y='334' className='label'>Исполнительный цилиндр</text>
          <rect x='648' y='344' width='116' height='28' rx='14' className='value-badge' />
          <text x='660' y='363' className='mono-value'>ход {position.toFixed(1)}%</text>
        </g>

        <g className='controller'>
          <rect x='648' y='398' width='218' height='70' rx='14' />
          <text x='670' y='424' className='label'>Формирователь импульсов</text>
          <text x='670' y='448' className='mono-value'>
            {formatTime(time)} / {flow.toFixed(2)} м³/ч
          </text>
        </g>
        <path className='signal-line is-active' d='M648 433 H590 V320' />
      </svg>
    </div>
  );
};
