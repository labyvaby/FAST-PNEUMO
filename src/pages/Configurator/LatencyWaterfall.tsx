import React from 'react';
import { LatencyRow, RigConfig, Target } from './rig';

// Где теряются миллисекунды: каждое звено цепочки на логарифмической шкале от 1 мкс до 100 мс.
// Вертикаль «1% tполн» — всё, что правее, заметно влияет на результат.

const LO = 1e-3;
const HI = 100;
const pos = (ms: number) => (Math.log10(Math.min(HI, Math.max(LO, ms)) / LO) / Math.log10(HI / LO)) * 100;
const fmt = (v: number) =>
  v < 0.01 ? `${(v * 1000).toFixed(0)} мкс` : v < 1 ? `${v.toFixed(3).replace('.', ',')} мс` : `${v.toFixed(2).replace('.', ',')} мс`;

const KIND: Record<LatencyRow['kind'], string> = {
  random: 'случайная',
  bias: 'сдвиг',
  measured: 'измеряем',
  off: 'не входит',
};

interface Props {
  rows: LatencyRow[];
  config: RigConfig;
  focus: Target | null;
  onFocus: (t: Target | null) => void;
}

export const LatencyWaterfall: React.FC<Props> = ({ rows, config, focus, onFocus }) => {
  const onePct = config.expectedMs / 100;
  const ticks = [0.001, 0.01, 0.1, 1, 10, 100];
  return (
    <div className='lw'>
      <div className='lw-scale'>
        {ticks.map((t) => (
          <span key={t} style={{ left: `${pos(t)}%` }}>
            {t < 1 ? (t < 0.01 ? '1 мкс' : t < 0.1 ? '10 мкс' : '0,1 мс') : `${t} мс`}
          </span>
        ))}
      </div>
      <div className='lw-rows'>
        <div className='lw-onepct' style={{ '--k': pos(onePct) / 100 } as React.CSSProperties}>
          <span>1% tполн</span>
        </div>
        {rows.map((row) => {
          const significant = row.kind !== 'measured' && row.kind !== 'off' && row.ms > onePct;
          return (
            <div
              key={row.key}
              className={`lw-row k-${row.kind} ${significant ? 'is-big' : ''} ${focus && focus !== row.target ? 'is-dim' : ''} ${focus === row.target ? 'is-focus' : ''}`}
              onMouseEnter={() => onFocus(row.target)}
              onMouseLeave={() => onFocus(null)}
            >
              <div className='lw-label'>
                <b>{row.label}</b>
                <span>
                  {KIND[row.kind]} · {row.hint}
                </span>
              </div>
              <div className='lw-track'>
                <i style={{ width: `${Math.max(1.5, pos(row.ms))}%` }} />
                <em style={{ left: `${Math.max(1.5, pos(row.ms))}%` }}>{fmt(row.ms)}</em>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
