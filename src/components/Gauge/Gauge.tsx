import { FC } from 'react';

interface GaugeProps {
  position: number;
  responseTimeMs: number | null;
  isForward: boolean;
  isRunning: boolean;
}

const C = 160;
const R = 130;
const SWEEP = 270;
const START = 135;

const polar = (percent: number, radius: number) => {
  const angle = ((START + (percent / 100) * SWEEP) * Math.PI) / 180;
  return { x: C + Math.cos(angle) * radius, y: C + Math.sin(angle) * radius };
};

/** Шкала хода золотника: дуга 270°, пороги 10% и 90%, по которым считается tср. */
const Gauge: FC<GaugeProps> = ({ position, responseTimeMs, isForward, isRunning }) => {
  const share = (SWEEP / 360) * 100;
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);
  const thresholds = [10, 90];

  return (
    <figure className='gauge' style={{ margin: 0 }}>
      <svg viewBox='-14 -14 348 348' role='img' aria-label={`Ход золотника ${position.toFixed(0)}%`}>
        <g transform={`rotate(${START} ${C} ${C})`}>
          <circle className='g-track' cx={C} cy={C} r={R} pathLength={100} strokeDasharray={`${share} 100`} />
          <circle
            className='g-arc'
            cx={C}
            cy={C}
            r={R}
            pathLength={100}
            strokeDasharray={`${Math.max(0.01, (position / 100) * share)} 100`}
          />
        </g>
        <g className='g-ticks'>
          {ticks.map((t) => {
            const a = polar(t, 146);
            const b = polar(t, 153);
            return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>
        <g className='g-thr'>
          {thresholds.map((t) => {
            const a = polar(t, 116);
            const b = polar(t, 152);
            const label = polar(t, 168);
            return (
              <g key={t}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <text x={label.x} y={label.y + 4}>{t}%</text>
              </g>
            );
          })}
        </g>
        <circle className='g-inner' cx={C} cy={C} r={100} />
        <text className='g-dir' x={C} y={116} fill={isForward ? '#1FB6CE' : '#8B6CFF'}>
          {isRunning ? (isForward ? '→ прямой ход' : '← обратный ход') : 'стенд в покое'}
        </text>
        <text className='g-big' x={C} y={178}>
          {responseTimeMs ?? '—'}
        </text>
        <text className='g-unit' x={C} y={202}>мс · <tspan style={{ textTransform: 'none' }}>tср</tspan></text>
        <text className='g-unit' x={C} y={232} style={{ fill: '#B9B7C8' }}>
          ход {position.toFixed(1)}%
        </text>
      </svg>
      <figcaption className='gauge-cap'>
        Время срабатывания фиксируется, когда золотник
        <br />
        проходит 90% хода (прямой) или 10% (обратный)
      </figcaption>
    </figure>
  );
};

export default Gauge;
