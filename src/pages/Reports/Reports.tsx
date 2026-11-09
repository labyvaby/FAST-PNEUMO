import React from 'react';
import { Link } from 'react-router-dom';
import { useLaunchContext } from '../../useLaunchContext';

const Statistics: React.FC = () => {
  const { launches } = useLaunchContext();
  const totalSamples = launches.reduce((sum, launch) => sum + launch.samplesCount, 0);
  const withResponses = launches.filter((launch) => launch.averageResponseTimeMs > 0);
  const averageDuration =
    launches.length > 0
      ? launches.reduce((sum, launch) => sum + launch.durationSeconds, 0) / launches.length
      : 0;
  const averageResponseTime =
    withResponses.length > 0
      ? withResponses.reduce((sum, launch) => sum + launch.averageResponseTimeMs, 0) /
        withResponses.length
      : 0;
  const bestResponse =
    withResponses.length > 0 ? Math.min(...withResponses.map((launch) => launch.minResponseTimeMs)) : 0;

  // общая шкала для полосок диапазона tср во всех карточках
  const scaleMax = Math.max(1000, ...launches.map((launch) => launch.maxResponseTimeMs));
  const pct = (value: number) => `${(value / scaleMax) * 100}%`;

  return (
    <>
      <section className='hero'>
        <div className='wrap' style={{ paddingBlock: 'clamp(40px, 6vw, 80px)' }}>
          <div className='hero-copy' style={{ marginBottom: 'clamp(24px, 3vw, 40px)' }}>
            <p className='kicker'>
              <b>07</b> · Журнал экспериментов
            </p>
            <h1 className='hero-h'>Отчёты по завершённым запускам</h1>
            <p className='hero-sub'>
              Каждая остановка стенда сохраняет запуск: длительность, число измерений и разброс
              времени срабатывания по серии переключений.
            </p>
          </div>
          <div className='stats' style={{ '--cols': 4 } as React.CSSProperties}>
            <div className='stat'>
              <span>Запусков</span>
              <b>{launches.length}</b>
              <em>завершено</em>
            </div>
            <div className='stat'>
              <span>Измерений</span>
              <b>{totalSamples}</b>
              <em>всего точек</em>
            </div>
            <div className='stat hi' style={{ '--acc': '#1FB6CE' } as React.CSSProperties}>
              <span>Среднее <i className='sym'>tср</i></span>
              <b>
                {averageResponseTime ? averageResponseTime.toFixed(0) : '—'}
                <small>мс</small>
              </b>
              <em>длительность {averageDuration.toFixed(1)} c</em>
            </div>
            <div className='stat hi' style={{ '--acc': '#44C18A' } as React.CSSProperties}>
              <span>Лучшее <i className='sym'>tср</i></span>
              <b>
                {bestResponse || '—'}
                <small>мс</small>
              </b>
              <em>минимум по всем запускам</em>
            </div>
          </div>
        </div>
      </section>

      <section className='act'>
        <div className='wrap'>
          {launches.length === 0 ? (
            <div className='empty-box'>
              <p className='kicker'>Журнал пуст</p>
              <h3>Пока нет завершённых запусков</h3>
              <p className='muted'>Запустите эксперимент на стенде и остановите его — здесь появится отчёт.</p>
              <Link className='btn btn-light' to='/dashboard'>
                Перейти к стенду
              </Link>
            </div>
          ) : (
            <div className='launches'>
              {launches
                .map((launch, index) => ({ launch, index }))
                .reverse()
                .map(({ launch, index }) => (
                  <article key={launch.id} className='card'>
                    <div className='launch-h'>
                      <div>
                        <p className='kicker'>
                          Запуск <b>№{String(index + 1).padStart(2, '0')}</b>
                        </p>
                        <b>{launch.timestamp}</b>
                      </div>
                      <span className='tag' style={{ '--acc': '#44C18A' } as React.CSSProperties}>
                        <i />
                        завершён
                      </span>
                    </div>

                    <div className='stats' style={{ '--cols': 2 } as React.CSSProperties}>
                      <div className='stat'>
                        <span>Длительность</span>
                        <b>
                          {launch.durationSeconds.toFixed(1)}
                          <small>c</small>
                        </b>
                      </div>
                      <div className='stat hi'>
                        <span>Среднее <i className='sym'>tср</i></span>
                        <b>
                          {launch.averageResponseTimeMs ? launch.averageResponseTimeMs.toFixed(0) : '—'}
                          <small>мс</small>
                        </b>
                      </div>
                    </div>

                    {launch.maxResponseTimeMs > 0 && (
                      <>
                        <div className='range' aria-label={`Диапазон tср ${launch.minResponseTimeMs}–${launch.maxResponseTimeMs} мс`}>
                          <i
                            style={{
                              left: pct(launch.minResponseTimeMs),
                              width: `calc(${pct(launch.maxResponseTimeMs)} - ${pct(launch.minResponseTimeMs)})`,
                            }}
                          />
                          <b style={{ left: pct(launch.averageResponseTimeMs) }} />
                        </div>
                        <div className='range-cap'>
                          <span>мин {launch.minResponseTimeMs.toFixed(0)} мс</span>
                          <span>макс {launch.maxResponseTimeMs.toFixed(0)} мс</span>
                        </div>
                      </>
                    )}

                    <ul className='avg-list'>
                      <li>Измерений<b>{launch.samplesCount}</b></li>
                      <li>Давление, среднее<b>{launch.pressure.toFixed(1)} кПа</b></li>
                      <li>Температура, средняя<b>{launch.temperature.toFixed(1)} °C</b></li>
                      <li>Расход, средний<b>{launch.flow.toFixed(2)} м³/ч</b></li>
                      <li>Скорость золотника<b>{launch.velocity.toFixed(1)} мм/с</b></li>
                      <li>Остановлен<b>{launch.endTimestamp}</b></li>
                    </ul>
                  </article>
                ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default Statistics;
