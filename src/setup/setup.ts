// «Текущая установка» — то, что связывает разделы со стендом:
//  • испытуемый распределитель (выбирается в Каталоге);
//  • параметры модели (правятся в Расчёте, калибровка записывает их сюда);
//  • подводящая линия (Утилиты): из-за потерь на распределитель приходит меньше давления, чем на регуляторе.
// Стенд, Расчёт, Утилиты и Отчёты читают одно и то же, поэтому изменение в одном разделе видно во всех.

import { DEFAULT_PARAMS, ValveParams } from '../lib/valveModel';
import { LineResult, lineDrop } from '../lib/pneumatics';
import { Valve } from '../data/valves';
import { findValve, valveLabel } from '../data/catalogStore';

export interface LineSetup {
  /** длина подводящей линии, м */
  lengthM: number;
  /** внутренний диаметр, мм */
  diameterMm: number;
  /** расход через линию, нл/мин */
  flowNlMin: number;
}

export interface StandSetup {
  /** испытуемый распределитель из каталога */
  valveId: string | null;
  /** параметры модели; supplyBar — давление на регуляторе, до линии */
  params: ValveParams;
  /** id распределителя, под даташит которого подобраны params */
  calibratedFor: string | null;
  line: LineSetup;
}

export const DEFAULT_LINE: LineSetup = { lengthM: 3, diameterMm: 4, flowNlMin: 150 };

export const DEFAULT_SETUP: StandSetup = {
  valveId: null,
  params: DEFAULT_PARAMS,
  calibratedFor: null,
  line: DEFAULT_LINE,
};

export const SETUP_STORAGE_KEY = 'pneumo-setup';

export const loadSetup = (): StandSetup => {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return DEFAULT_SETUP;
    const saved = JSON.parse(raw) as Partial<StandSetup>;
    return {
      ...DEFAULT_SETUP,
      ...saved,
      params: { ...DEFAULT_PARAMS, ...saved.params },
      line: { ...DEFAULT_LINE, ...saved.line },
    };
  } catch {
    return DEFAULT_SETUP;
  }
};

export interface StandView {
  setup: StandSetup;
  valve: Valve | undefined;
  /** параметры подобраны под даташит выбранного распределителя */
  calibrated: boolean;
  /** давление на регуляторе, бар изб. */
  regulatorBar: number;
  /** потери в линии при давлении регулатора */
  line: LineResult;
  /** давление на распределителе после линии, бар изб. */
  valveBar: number;
  /** параметры для модели: давление уже за линией */
  effectiveParams: ValveParams;
  label: string;
}

/** Давление на распределителе при заданном давлении регулятора. */
export const pressureAtValve = (regulatorBar: number, line: LineSetup) => {
  const result = lineDrop({ p1Bar: regulatorBar, flowNlMin: line.flowNlMin, lengthM: line.lengthM, diameterMm: line.diameterMm });
  return { result, valveBar: Math.max(0, result.p2Bar) };
};

export const describeSetup = (setup: StandSetup): StandView => {
  const valve = findValve(setup.valveId);
  const regulatorBar = setup.params.supplyBar;
  const { result, valveBar } = pressureAtValve(regulatorBar, setup.line);
  return {
    setup,
    valve,
    calibrated: !!valve && setup.calibratedFor === valve.id,
    regulatorBar,
    line: result,
    valveBar,
    effectiveParams: { ...setup.params, supplyBar: valveBar },
    label: valve ? valveLabel(valve) : 'Типовой распределитель',
  };
};
