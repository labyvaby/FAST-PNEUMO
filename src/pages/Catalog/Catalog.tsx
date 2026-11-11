import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { FaTrash } from 'react-icons/fa6';
import { AXIS, COLORS, GRID, TOOLTIP } from '../../lib/chartSetup';
import { NumField, PageHead, Select, Slider, TextField } from '../../components/Fields';
import { SEAL_TYPES, SealType, VALVES, VALVE_TYPES, Valve, ValveType } from '../../data/valves';

const STORAGE_KEY = 'pneumo-catalog';
const MAX_COMPARE = 4;

const loadUser = (): Valve[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Valve[]) : [];
  } catch {
    return [];
  }
};

const saveUser = (valves: Valve[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valves));
  } catch {
    /* хранилище недоступно — данные останутся до перезагрузки */
  }
};

const isValve = (item: unknown): item is Valve => {
  const v = item as Valve;
  return !!v && typeof v.maker === 'string' && typeof v.model === 'string' && typeof v.onMs === 'number' && typeof v.offMs === 'number';
};

const response = (valve: Valve) => Math.max(valve.onMs, valve.offMs);

type Draft = {
  maker: string;
  model: string;
  type: ValveType;
  seal: SealType;
  onMs: number | '';
  offMs: number | '';
  qnLmin: number | '';
  massG: number | '';
  strokeMm: number | '';
  pMinBar: number | '';
  pMaxBar: number | '';
  source: string;
  note: string;
};

const EMPTY: Draft = {
  maker: '',
  model: '',
  type: '5/2 моностабильный',
  seal: 'эластичное',
  onMs: '',
  offMs: '',
  qnLmin: '',
  massG: '',
  strokeMm: '',
  pMinBar: '',
  pMaxBar: '',
  source: '',
  note: '',
};

const opt = (value: number | '') => (value === '' ? undefined : value);
const show = (value?: number, unit = '') => (value === undefined ? '—' : `${value}${unit ? ` ${unit}` : ''}`);

const Catalog: React.FC = () => {
  const [userValves, setUserValves] = useState<Valve[]>(loadUser);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ValveType>('all');
  const [sealFilter, setSealFilter] = useState<'all' | SealType>('all');
  const [maxMsRaw, setMaxMs] = useState<number | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveUser(userValves), [userValves]);

  const all = useMemo(() => [...VALVES, ...userValves], [userValves]);
  const sliderMax = Math.max(100, ...all.map(response));
  const maxMs = maxMsRaw ?? sliderMax;

  const filtered = all
    .filter((valve) => response(valve) <= maxMs)
    .filter((valve) => typeFilter === 'all' || valve.type === typeFilter)
    .filter((valve) => sealFilter === 'all' || valve.seal === sealFilter)
    .filter((valve) => `${valve.maker} ${valve.model}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => response(a) - response(b));

  const compared = compare.map((id) => all.find((valve) => valve.id === id)).filter((v): v is Valve => !!v);
  const isBuiltIn = (id: string) => VALVES.some((valve) => valve.id === id);

  const toggleCompare = (id: string) => {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id]));
  };

  const remove = (id: string) => {
    setUserValves((prev) => prev.filter((valve) => valve.id !== id));
    setCompare((prev) => prev.filter((x) => x !== id));
  };

  const setField = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.maker.trim() || !draft.model.trim()) return setFormError('Укажите производителя и модель.');
    if (draft.onMs === '' || draft.offMs === '') return setFormError('Укажите время включения и выключения из даташита.');
    if (!draft.source.trim()) return setFormError('Укажите источник: ссылку на даташит или название каталога.');
    const valve: Valve = {
      id: `${Date.now()}`,
      maker: draft.maker.trim(),
      model: draft.model.trim(),
      type: draft.type,
      seal: draft.seal,
      onMs: draft.onMs,
      offMs: draft.offMs,
      qnLmin: opt(draft.qnLmin),
      massG: opt(draft.massG),
      strokeMm: opt(draft.strokeMm),
      pMinBar: opt(draft.pMinBar),
      pMaxBar: opt(draft.pMaxBar),
      source: draft.source.trim(),
      note: draft.note.trim() || undefined,
    };
    setUserValves((prev) => [...prev, valve]);
    setDraft(EMPTY);
    setFormError('');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(userValves, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'valves.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const list = (Array.isArray(parsed) ? parsed : []).filter(isValve);
      const known = new Set(all.map((valve) => valve.id));
      const fresh = list.map((valve, i) => (known.has(valve.id) ? { ...valve, id: `${Date.now()}-${i}` } : valve));
      setUserValves((prev) => [...prev, ...fresh]);
      setImportMsg(`Добавлено моделей: ${fresh.length}`);
    } catch {
      setImportMsg('Не удалось прочитать файл: нужен JSON-массив моделей.');
    }
  };

  // лучшие значения для подсветки в сравнении (меньше — лучше, для расхода — больше)
  const best = (pick: (v: Valve) => number | undefined, higher = false) => {
    const values = compared.map(pick).filter((x): x is number => x !== undefined);
    if (values.length < 2) return undefined;
    return higher ? Math.max(...values) : Math.min(...values);
  };
  const rows: { label: string; pick: (v: Valve) => number | undefined; unit: string; higher?: boolean }[] = [
    { label: 'Время включения', pick: (v) => v.onMs, unit: 'мс' },
    { label: 'Время выключения', pick: (v) => v.offMs, unit: 'мс' },
    { label: 'Номинальный расход', pick: (v) => v.qnLmin, unit: 'л/мин', higher: true },
    { label: 'Масса', pick: (v) => v.massG, unit: 'г' },
    { label: 'Ход золотника', pick: (v) => v.strokeMm, unit: 'мм' },
  ];

  const barData: ChartData<'bar'> = {
    labels: compared.map((valve) => `${valve.maker} ${valve.model}`),
    datasets: [
      { label: 'включение, мс', data: compared.map((v) => v.onMs), backgroundColor: COLORS.teal, borderRadius: 6 },
      { label: 'выключение, мс', data: compared.map((v) => v.offMs), backgroundColor: COLORS.violet, borderRadius: 6 },
    ],
  };
  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: TOOLTIP },
    scales: {
      x: { grid: { display: false }, border: { color: AXIS } },
      y: { min: 0, title: { display: true, text: 'мс' }, grid: { color: GRID }, border: { display: false } },
    },
  };

  const fastest = [...compared].sort((a, b) => response(a) - response(b));

  return (
    <>
      <PageHead num='03' kicker='Каталог и сравнение' title={<>Распределители по <span className='grad'>времени отклика</span></>}>
        Каталог заполняется из даташитов: каждая модель вносится с источником. Фильтруйте по времени
        отклика, отметьте до четырёх моделей и сравните их конструкцию и скорость.
      </PageHead>

      <section className='act'>
        <div className='wrap stack'>
          <div className='toolbar'>
            <div className='field'>
              <label htmlFor='q'>Поиск</label>
              <input id='q' className='inp' value={query} placeholder='производитель или модель' onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select
              label='Тип'
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ value: 'all', label: 'все типы' }, ...VALVE_TYPES.map((t) => ({ value: t, label: t }))]}
            />
            <Select
              label='Уплотнение'
              value={sealFilter}
              onChange={setSealFilter}
              options={[{ value: 'all', label: 'любое' }, ...SEAL_TYPES.map((t) => ({ value: t, label: t }))]}
            />
            <div className='field' style={{ flexBasis: 260 }}>
              <Slider label='Отклик не больше' value={Math.min(maxMs, sliderMax)} min={1} max={sliderMax} step={1} unit='мс' digits={0} onChange={setMaxMs} />
            </div>
          </div>

          {all.length === 0 ? (
            <div className='empty-box'>
              <p className='kicker'>Каталог пуст</p>
              <h3>Добавьте первую модель из даташита</h3>
              <p className='muted' style={{ maxWidth: '60ch' }}>
                Время включения и выключения обычно приводится в разделе «Технические данные» каталога производителя.
                Форма ниже, данные хранятся в этом браузере.
              </p>
            </div>
          ) : (
            <div className='tbl-wrap'>
              <table className='tbl'>
                <thead>
                  <tr>
                    <th>Сравнить</th>
                    <th>Модель</th>
                    <th>Тип</th>
                    <th>Вкл / выкл</th>
                    <th>Qn</th>
                    <th>Масса</th>
                    <th>Уплотнение</th>
                    <th>Источник</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((valve) => {
                    const on = compare.includes(valve.id);
                    return (
                      <tr key={valve.id} className={on ? 'on' : ''}>
                        <td>
                          <input
                            className='check'
                            type='checkbox'
                            checked={on}
                            disabled={!on && compare.length >= MAX_COMPARE}
                            onChange={() => toggleCompare(valve.id)}
                            aria-label={`Сравнить ${valve.model}`}
                          />
                        </td>
                        <td className='name' title={valve.note}>
                          <b>{valve.model}</b>
                          <span>
                            {valve.maker}
                            {valve.note && ' · есть примечание'}
                          </span>
                        </td>
                        <td>{valve.type}</td>
                        <td className='num'>
                          {valve.onMs} / {valve.offMs} мс
                        </td>
                        <td className='num'>{show(valve.qnLmin, 'л/мин')}</td>
                        <td className='num'>{show(valve.massG, 'г')}</td>
                        <td>{valve.seal}</td>
                        <td>
                          {/^https?:\/\//.test(valve.source) ? (
                            <a href={valve.source} target='_blank' rel='noreferrer'>
                              даташит
                            </a>
                          ) : (
                            valve.source
                          )}
                        </td>
                        <td>
                          {!isBuiltIn(valve.id) && (
                            <button type='button' className='icon-btn' onClick={() => remove(valve.id)} aria-label={`Удалить ${valve.model}`}>
                              <FaTrash size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 28 }}>
                        Под фильтр ничего не попало — ослабьте ограничение по времени отклика.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {compared.length > 0 && (
        <section className='act'>
          <div className='wrap'>
            <div className='head2'>
              <p className='kicker'>
                <b>II</b> · Сравнение · {compared.length} из {MAX_COMPARE}
              </p>
              <div className='head2-row'>
                <h2 className='h2x'>Кто быстрее и почему</h2>
                {fastest.length > 1 && (
                  <p className='sub2'>
                    Быстрее всех — <b>{fastest[0].maker} {fastest[0].model}</b>: {response(fastest[0])} мс против{' '}
                    {response(fastest[fastest.length - 1])} мс у самой медленной модели (по худшему из времён вкл/выкл).
                  </p>
                )}
              </div>
            </div>
            <div className='two'>
              <div className='tbl-wrap'>
                <table className='tbl' style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Параметр</th>
                      {compared.map((valve) => (
                        <th key={valve.id}>{valve.model}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Производитель</td>
                      {compared.map((valve) => (
                        <td key={valve.id}>{valve.maker}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Тип</td>
                      {compared.map((valve) => (
                        <td key={valve.id}>{valve.type}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Уплотнение</td>
                      {compared.map((valve) => (
                        <td key={valve.id}>{valve.seal}</td>
                      ))}
                    </tr>
                    {rows.map((row) => {
                      const top = best(row.pick, row.higher);
                      return (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          {compared.map((valve) => {
                            const value = row.pick(valve);
                            return (
                              <td key={valve.id} className={`num ${value !== undefined && value === top ? 'best' : ''}`}>
                                {show(value, row.unit)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr>
                      <td>Давление</td>
                      {compared.map((valve) => (
                        <td key={valve.id} className='num'>
                          {valve.pMinBar !== undefined || valve.pMaxBar !== undefined
                            ? `${show(valve.pMinBar)}–${show(valve.pMaxBar)} бар`
                            : '—'}
                        </td>
                      ))}
                    </tr>
                    {compared.some((valve) => valve.note) && (
                      <tr>
                        <td>Примечание</td>
                        {compared.map((valve) => (
                          <td key={valve.id} style={{ whiteSpace: 'normal', minWidth: 180, fontSize: 13, lineHeight: 1.45 }}>
                            {valve.note ?? '—'}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className='card'>
                <h3 className='card-t' style={{ marginBottom: 14 }}>Время включения и выключения</h3>
                <div className='chart-box' style={{ height: 260 }}>
                  <Bar data={barData} options={barOptions} />
                </div>
                <div className='legend'>
                  <span><i style={{ '--c': COLORS.teal } as React.CSSProperties} />включение</span>
                  <span><i style={{ '--c': COLORS.violet } as React.CSSProperties} />выключение</span>
                </div>
              </div>
            </div>
            <div className='grid3' style={{ marginTop: 16 }}>
              <p className='note'>Металлическая пара золотник–гильза трогается легче эластичных уплотнений: меньше трение покоя — меньше задержка.</p>
              <p className='note'>Лёгкий золотник и короткий ход сокращают время движения; в калькуляторе это видно на графике t(m).</p>
              <p className='note'>Моностабильный возвращается пружиной, поэтому время выключения у него обычно отличается от включения.</p>
            </div>
          </div>
        </section>
      )}

      <section className='act'>
        <div className='wrap two'>
          <form className='card' onSubmit={submit} style={{ '--acc': COLORS.green } as React.CSSProperties}>
            <div className='card-h'>
              <div>
                <h2 className='card-t'>Добавить модель</h2>
                <p className='card-s'>Только данные из даташита, с источником</p>
              </div>
            </div>
            <div className='fields'>
              <div className='grid2'>
                <TextField label='Производитель *' value={draft.maker} onChange={setField('maker')} />
                <TextField label='Модель *' value={draft.model} onChange={setField('model')} />
              </div>
              <div className='grid2'>
                <Select label='Тип' value={draft.type} onChange={setField('type')} options={VALVE_TYPES.map((t) => ({ value: t, label: t }))} />
                <Select label='Уплотнение' value={draft.seal} onChange={setField('seal')} options={SEAL_TYPES.map((t) => ({ value: t, label: t }))} />
              </div>
              <div className='grid2'>
                <NumField label='Время включения, мс *' value={draft.onMs} onChange={setField('onMs')} />
                <NumField label='Время выключения, мс *' value={draft.offMs} onChange={setField('offMs')} />
              </div>
              <div className='grid3'>
                <NumField label='Qn, л/мин' value={draft.qnLmin} step={1} onChange={setField('qnLmin')} />
                <NumField label='Масса, г' value={draft.massG} step={1} onChange={setField('massG')} />
                <NumField label='Ход, мм' value={draft.strokeMm} onChange={setField('strokeMm')} />
              </div>
              <div className='grid2'>
                <NumField label='P мин, бар' value={draft.pMinBar} onChange={setField('pMinBar')} />
                <NumField label='P макс, бар' value={draft.pMaxBar} onChange={setField('pMaxBar')} />
              </div>
              <TextField label='Источник *' value={draft.source} placeholder='ссылка на даташит или название каталога' onChange={setField('source')} />
              <TextField label='Примечание' value={draft.note} onChange={setField('note')} />
              {formError && <div className='alert err'>{formError}</div>}
              <div>
                <button type='submit' className='btn btn-light'>
                  Добавить в каталог
                </button>
              </div>
            </div>
          </form>

          <div className='stack'>
            <div className='card'>
              <p className='kicker' style={{ marginBottom: 10 }}>Перенос данных</p>
              <p className='muted' style={{ marginBottom: 16 }}>
                Модели из формы хранятся в этом браузере. Выгрузите их в JSON, чтобы перенести на другой компьютер
                или вписать в <code className='mono'>src/data/valves.ts</code> — тогда они будут у всех.
              </p>
              <div className='ctl-btns'>
                <button type='button' className='btn btn-ghost btn-sm' onClick={exportJson} disabled={userValves.length === 0}>
                  Экспорт JSON
                </button>
                <button type='button' className='btn btn-ghost btn-sm' onClick={() => fileRef.current?.click()}>
                  Импорт JSON
                </button>
                <input
                  ref={fileRef}
                  type='file'
                  accept='application/json,.json'
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) importJson(file);
                    event.target.value = '';
                  }}
                />
              </div>
              {importMsg && <p className='card-s' style={{ marginTop: 12 }}>{importMsg}</p>}
            </div>
            <ul className='kv card'>
              <li>Моделей в каталоге<b>{all.length}</b></li>
              <li>Из файла данных<b>{VALVES.length}</b></li>
              <li>Добавлено в браузере<b>{userValves.length}</b></li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
};

export default Catalog;
