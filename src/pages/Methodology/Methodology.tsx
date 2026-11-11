import React from 'react';
import { Oscilloscope } from '../../components/Oscilloscope';

const sensors = [
  { num: '01', label: 'Датчик давления', value: 'P, кПа', hint: 'Контроль давления питания и просадки магистрали при переключении.', acc: '#1FB6CE' },
  { num: '02', label: 'Датчик положения', value: 'x, %', hint: 'Фиксирует момент, когда золотник проходит 90% или 10% хода.', acc: '#44C18A' },
  { num: '03', label: 'Датчик расхода', value: 'Q, м³/ч', hint: 'Показывает динамику наполнения полости цилиндра.', acc: '#3E74F0' },
  { num: '04', label: 'Таймер импульса', value: 't, мс', hint: 'Отмечает t0 — момент подачи команды, от него ведётся отсчёт.', acc: '#F2B43C' },
];

const algorithmSteps: [string, string][] = [
  ['Инициализация.', 'Задаются давление питания, ход золотника, период управляющих импульсов и шаг дискретизации.'],
  ['Импульс.', 'На распределитель подаётся управляющий импульс, фиксируется момент t0.'],
  ['Регистрация.', 'Давление, расход и положение золотника измеряются с постоянным шагом.'],
  ['Задержка.', 'Определяется задержка начала движения после управляющего импульса.'],
  ['Порог.', 'Фиксируется время достижения 90% хода при прямом переключении или 10% при обратном.'],
  ['Отчёт.', 'По серии циклов считаются среднее, минимальное и максимальное время срабатывания.'],
];

const formulas = [
  { label: 'Время срабатывания', value: 'tср = t90 − t0', hint: 'для прямого хода; для обратного используется t10' },
  { label: 'Скорость золотника', value: 'v = Δx / Δt', hint: 'переводится в мм/с через полный ход золотника' },
  { label: 'Пневматическая мощность', value: 'N = P · Q / 3600', hint: 'упрощённая оценка энергии сжатого воздуха' },
];

const Methodology: React.FC = () => {
  return (
    <>
      <section className='hero'>
        <div className='wrap' style={{ paddingBlock: 'clamp(40px, 6vw, 88px)' }}>
          <div className='hero-copy'>
            <p className='kicker'>
              <b>06</b> · Методика измерения
            </p>
            <h1 className='hero-h' style={{ maxWidth: '16em' }}>
              Программно-аппаратный стенд исследования <span className='grad'>быстродействия</span>
            </h1>
            <p className='hero-sub'>
              Стенд определяет время срабатывания пневматического золотникового распределителя по
              реакции золотника и исполнительного цилиндра на управляющий импульс. Ниже — что
              измеряется, в каком порядке и по каким формулам.
            </p>
          </div>
        </div>
      </section>

      <section className='act'>
        <div className='wrap'>
          <div className='head2'>
            <p className='kicker'>
              <b>I</b> · Каналы измерения
            </p>
            <h2 className='h2x'>Четыре датчика — одна картина переключения</h2>
          </div>
          <div className='tiles'>
            {sensors.map((sensor) => (
              <article key={sensor.label} className='tile' style={{ '--acc': sensor.acc } as React.CSSProperties}>
                <p className='tile-top'>
                  <b>{sensor.num}</b> канал
                </p>
                <h3 className='tile-name'>{sensor.label}</h3>
                <p className='tile-h'>{sensor.hint}</p>
                <p className='tile-val'>{sensor.value}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className='act'>
        <div className='wrap'>
          <div className='head2'>
            <p className='kicker'>
              <b>II</b> · Практикум
            </p>
            <h2 className='h2x'>Измерьте время срабатывания сами</h2>
            <p className='sub2'>
              Осциллограмма одного переключения по физической модели распределителя — как на экране
              настоящего прибора, с шумом датчиков. Поставьте курсоры, как требует методика, и
              сравните результат с эталоном.
            </p>
          </div>
          <Oscilloscope />
        </div>
      </section>

      <section className='act'>
        <div className='wrap two'>
          <div>
            <div className='head2'>
              <p className='kicker'>
                <b>III</b> · Алгоритм
              </p>
              <h2 className='h2x'>Шесть шагов одного измерения</h2>
            </div>
            <ol className='steps'>
              {algorithmSteps.map(([title, text]) => (
                <li key={title}>
                  <p>
                    <b>{title}</b> {text}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className='stack'>
            <div className='head2' style={{ marginBottom: 8 }}>
              <p className='kicker'>
                <b>IV</b> · Расчётные зависимости
              </p>
            </div>
            {formulas.map((formula) => (
              <div key={formula.label} className='formula'>
                <span>{formula.label}</span>
                <code>{formula.value}</code>
                <em>{formula.hint}</em>
              </div>
            ))}
            <div className='card' style={{ marginTop: 12, '--acc': '#44C18A' } as React.CSSProperties}>
              <p className='kicker' style={{ marginBottom: 10 }}>Технический результат</p>
              <p className='muted'>
                Повышение наглядности и воспроизводимости измерения быстродействия за счёт
                синхронной регистрации управляющего импульса, положения золотника, давления и
                расхода с автоматическим расчётом времени достижения пороговых положений.
              </p>
            </div>
            <p className='note'>
              Объект для заявки стоит описывать не как сайт, а как способ и программно-аппаратную
              систему измерения быстродействия пневматического золотникового распределителя.
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default Methodology;
