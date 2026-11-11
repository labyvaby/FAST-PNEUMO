// Раскадровка: что показывает 3D-сцена на каждом слайде.
// Порядок совпадает с порядком <section class="slide"> в presentation/index.html.

import type { Mode } from './kinematics';
import type { AnchorId, Fx } from './valve3d';

export type Hud = 'none' | 'phases' | 'scope';
type Vec3 = [number, number, number];

export interface Shot {
  cam: Vec3;
  look: Vec3;
  /** амплитуда покачивания камеры вокруг модели, рад */
  orbit: number;
  mode: Mode;
  hud: Hud;
  callouts: AnchorId[];
  fx: Partial<Fx>;
}

export const BASE_FX: Fx = {
  explode: 0,
  particles: 1,
  glowCoil: 0.3,
  glowPilot: 0.3,
  glowSpool: 0.3,
  glowSpring: 0,
  signal: 0,
  line: 0,
  marker: 0,
  tune: 0,
  wire: 0,
};

export const CALLOUTS: Record<AnchorId, string> = {
  portR: 'R',
  portA: 'A',
  portP: 'P',
  portB: 'B',
  portS: 'S',
  coil: 'катушка пилота',
  pilot: 'камера пилота',
  spool: 'золотник',
  spring: 'пружина',
  cyl: 'цилиндр',
  orifice: 'd — канал пилота',
  ctrl: 'контроллер',
  line: 'подводящая линия',
  t90: '90 % хода',
};

const PORTS: AnchorId[] = ['portR', 'portA', 'portP', 'portB', 'portS'];

export const SHOTS: Shot[] = [
  // 1 · обложка
  { cam: [6.5, 5.4, 21.5], look: [0, 1.2, 0], orbit: 0.3, mode: 'cycle', hud: 'none', callouts: [], fx: {} },
  // 2 · задача
  { cam: [1.5, 3.6, 24], look: [0.6, 1.9, 0], orbit: 0.1, mode: 'cycle', hud: 'none', callouts: ['cyl'], fx: {} },
  // 3 · цель
  { cam: [-9, 6.5, 19], look: [0, 1, 0], orbit: 0.16, mode: 'cycle', hud: 'none', callouts: ['coil', 'spool', 'spring', 'cyl'], fx: { explode: 1 } },
  // 4 · модель: три фазы
  { cam: [-1.2, 1.2, 18], look: [-0.4, 0.2, 0], orbit: 0.05, mode: 'replay', hud: 'phases', callouts: ['coil', 'pilot', 'spool'], fx: { explode: 1, glowCoil: 1, glowPilot: 1, glowSpool: 1 } },
  // 5 · цифры
  { cam: [2.2, 0.8, 13.5], look: [0.6, -0.7, 0], orbit: 0.05, mode: 'both', hud: 'scope', callouts: ['spool', 'spring'], fx: { explode: 1, glowSpool: 1, glowPilot: 0.8 } },
  // 6 · калибровка
  { cam: [0, 3.4, 18.5], look: [0, 0.5, 0], orbit: 0.08, mode: 'replay', hud: 'none', callouts: ['orifice', 'spring'], fx: { explode: 1, tune: 1, glowPilot: 1 } },
  // 7 · установка
  { cam: [4, 7.5, 26], look: [-0.8, 0.5, 0], orbit: 0.28, mode: 'cycle', hud: 'none', callouts: ['line', 'cyl'], fx: { line: 1 } },
  // 8 · разделы сайта
  { cam: [-9, 10, 19], look: [0, 1, 0], orbit: 0.22, mode: 'cycle', hud: 'none', callouts: [], fx: { line: 1 } },
  // 9 · стенд: живой разрез
  { cam: [1.6, 0.4, 12.5], look: [0.5, -0.1, 0], orbit: 0.05, mode: 'cycle', hud: 'none', callouts: PORTS, fx: { explode: 1, glowSpool: 0.8 } },
  // 10 · конфигуратор
  { cam: [-8.5, 4.6, 13.5], look: [-6.4, 2.8, 0], orbit: 0.06, mode: 'cycle', hud: 'none', callouts: ['ctrl', 'coil'], fx: { signal: 1, glowCoil: 1 } },
  // 11 · методика
  { cam: [4.2, 0.9, 11.5], look: [2.4, -0.7, 0], orbit: 0.04, mode: 'replay', hud: 'scope', callouts: ['t90'], fx: { explode: 1, marker: 1, glowSpool: 1 } },
  // 12 · реализация
  { cam: [8, 5, 21], look: [0, 1.2, 0], orbit: 0.3, mode: 'cycle', hud: 'none', callouts: [], fx: { wire: 1 } },
  // 13 · итоги
  { cam: [-7, 4.2, 21], look: [0, 1.2, 0], orbit: 0.22, mode: 'cycle', hud: 'none', callouts: [], fx: {} },
  // 14 · финал
  { cam: [0, 3.2, 25], look: [0, 1.4, 0], orbit: 0.4, mode: 'cycle', hud: 'none', callouts: [], fx: {} },
];
