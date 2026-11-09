// Пневматические утилиты: пересчёт пропускной способности и падение давления в линии.
//
// Пересчёт идёт через расход при стандартных условиях (вход 6 бар изб. = 7 бар абс.,
// выход 5 бар изб., Δp = 1 бар, 20 °C):
//  • Cv = 1.156 · Kv (определения: галлоны воды в минуту при 1 psi и м³/ч воды при 1 бар);
//  • Qn по Kv — формула для газа (VDI/VDE 2173): Q = 514 · Kv · √(Δp · p2 / (ρн · T)), м³/ч;
//  • Qn по C и b — ISO 6358: Q = C · p1 · √(1 − ((p2/p1 − b)/(1 − b))²) · √(293/T), дм³/с;
//  • S ≈ 5 · C — эффективная площадь, мм² (эмпирическое правило JIS).
// Связь Cv/Kv с C зависит от b, поэтому пересчёт приблизительный.

const P1_ABS = 7;
const P2_ABS = 6;
const DP = P1_ABS - P2_ABS;
const RHO_N = 1.293;
const T_STD = 293;

export type FlowUnit = 'cv' | 'kv' | 'qn' | 'c';

export const FLOW_UNITS: Record<FlowUnit, { label: string; unit: string; hint: string }> = {
  cv: { label: 'Cv', unit: 'US gal/min', hint: 'расход воды при перепаде 1 psi' },
  kv: { label: 'Kv', unit: 'м³/ч', hint: 'расход воды при перепаде 1 бар' },
  qn: { label: 'Qn', unit: 'л/мин', hint: 'номинальный расход воздуха: 6 → 5 бар' },
  c: { label: 'C', unit: 'дм³/(с·бар)', hint: 'звуковая проводимость по ISO 6358' },
};

/** Qn, л/мин из Kv. */
const qnFromKv = (kv: number) => 514 * kv * Math.sqrt((DP * P2_ABS) / (RHO_N * T_STD)) * (1000 / 60);

/** Qn, л/мин из C и b. */
const qnFromC = (c: number, b: number) => {
  const r = P2_ABS / P1_ABS;
  const subsonic = r > b ? Math.sqrt(1 - ((r - b) / (1 - b)) ** 2) : 1;
  return c * P1_ABS * subsonic * 60;
};

export const convertFlow = (value: number, from: FlowUnit, b: number) => {
  const kvPerQn = 1 / qnFromKv(1);
  const cPerQn = 1 / qnFromC(1, b);
  let qn = 0;
  if (from === 'cv') qn = qnFromKv(value / 1.156);
  if (from === 'kv') qn = qnFromKv(value);
  if (from === 'qn') qn = value;
  if (from === 'c') qn = qnFromC(value, b);
  const kv = qn * kvPerQn;
  const c = qn * cPerQn;
  return { cv: kv * 1.156, kv, qn, c, s: c * 5 };
};

// ---------- падение давления в линии ----------

const R_AIR = 287;
const MU_AIR = 1.81e-5;
const RHO_ANR = 1.204;
const SOUND_SPEED = 343;

export interface LineInput {
  /** давление на входе линии, бар изб. */
  p1Bar: number;
  /** расход, нл/мин */
  flowNlMin: number;
  /** длина, м */
  lengthM: number;
  /** внутренний диаметр, мм */
  diameterMm: number;
}

export interface LineResult {
  ok: boolean;
  dpBar: number;
  p2Bar: number;
  velocity: number;
  reynolds: number;
  regime: 'ламинарный' | 'переходный' | 'турбулентный';
  frictionFactor: number;
  volumeCm3: number;
  waveMs: number;
}

const frictionFactor = (re: number) => {
  if (re < 2300) return 64 / re;
  if (re < 1e5) return 0.3164 / Math.pow(re, 0.25);
  const inv = -1.8 * Math.log10(6.9 / re);
  return 1 / (inv * inv);
};

export const lineDrop = ({ p1Bar, flowNlMin, lengthM, diameterMm }: LineInput): LineResult => {
  const d = diameterMm / 1000;
  const area = (Math.PI * d * d) / 4;
  const massFlow = (RHO_ANR * flowNlMin) / 60000;
  const p1 = p1Bar * 1e5 + 101325;
  const reynolds = (massFlow * d) / (area * MU_AIR);
  const f = frictionFactor(Math.max(reynolds, 1));
  let p2 = p1;
  let ok = true;
  for (let i = 0; i < 40; i++) {
    const pm = (p1 + p2) / 2;
    const rho = pm / (R_AIR * 293);
    const v = massFlow / (rho * area);
    const dp = (f * lengthM * rho * v * v) / (2 * d);
    const next = p1 - dp;
    if (next < p1 * 0.5) {
      ok = false;
      p2 = p1 * 0.5;
      break;
    }
    p2 = next;
  }
  const rhoOut = p2 / (R_AIR * 293);
  return {
    ok,
    dpBar: (p1 - p2) / 1e5,
    p2Bar: (p2 - 101325) / 1e5,
    velocity: massFlow / (rhoOut * area),
    reynolds,
    regime: reynolds < 2300 ? 'ламинарный' : reynolds < 4000 ? 'переходный' : 'турбулентный',
    frictionFactor: f,
    volumeCm3: area * lengthM * 1e6,
    waveMs: (lengthM / SOUND_SPEED) * 1000,
  };
};
