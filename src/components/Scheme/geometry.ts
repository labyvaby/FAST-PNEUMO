// Геометрия разреза распределителя 5/2 (координаты viewBox 960×540) и расчёт того,
// какие каналы открыты при данном положении золотника.
//
// Порты вдоль гильзы слева направо: S(5) A(4) P(1) B(2) R(3), шаг 80, ширина окна 34.
// Золотник с тремя поясками шириной 40 смещается на SHIFT = 80 вправо.
//  • x = 0   (исходное): P→B, A→S;
//  • x = 100 (включён):  P→A, B→R.
// Между ними есть зона, где поясок L2 перекрывает P полностью (положительное перекрытие) —
// все каналы закрыты, это видно на разрезе и в замедленном повторе.

export const SHIFT = 80;
export const PORT_W = 34;
export const LAND_W = 40;

export const BORE = { x0: 256, x1: 714, y0: 198, y1: 242, cy: 220 };
export const BODY = { x: 250, y: 160, w: 470, h: 130 };

export const PORTS = {
  S: 320,
  A: 400,
  P: 480,
  B: 560,
  R: 640,
} as const;

/** Центры поясков при x = 0. */
export const LANDS0 = [280, 440, 600];

export const CYL = { x0: 330, x1: 640, y0: 34, y1: 112, cy: 73 };
export const PISTON_W = 24;
export const PISTON_MIN = 362;
export const PISTON_MAX = CYL.x1 - 6 - PISTON_W;
/** Длина штока: при втянутом поршне конец штока чуть выходит из крышки. */
export const ROD_LEN = CYL.x1 - PISTON_MIN - PISTON_W + 34;
/** Точки подключения полостей A и B на крышках цилиндра. */
export const CYL_A_X = CYL.x0 + 20;
export const CYL_B_X = CYL.x1 - 20;

export const PILOT_X = 236;
export const COIL = { x: 136, y: 270, w: 74, h: 60 };
/** Кончик плунжера: закрыт — перекрывает пилотный канал, открыт — втянут в катушку. */
export const PLUNGER_TIP_CLOSED = PILOT_X - 4;
export const PLUNGER_TIP_OPEN = PILOT_X - 22;

export const SILENCERS = [
  { x: PORTS.S, y: 318 },
  { x: PORTS.R, y: 318 },
];
export const PILOT_VENT = { x: PILOT_X, y: 146 };

/** Статичные трубопроводы. */
export const PIPES = {
  main: `M142 440 H${PORTS.P} V${BODY.y + BODY.h}`,
  pilotSupply: `M${PILOT_X} 440 V${BORE.cy}`,
  pilotJoin: `M${PILOT_X} ${BORE.cy} H${BORE.x0}`,
  pilotVent: `M${PILOT_X} ${BORE.cy} V${PILOT_VENT.y + 4}`,
  lineA: `M${PORTS.A} ${BODY.y} V130 H${CYL_A_X} V${CYL.y1}`,
  lineB: `M${PORTS.B} ${BODY.y} V130 H${CYL_B_X} V${CYL.y1}`,
  exhaustS: `M${PORTS.S} ${BODY.y + BODY.h} V${SILENCERS[0].y}`,
  exhaustR: `M${PORTS.R} ${BODY.y + BODY.h} V${SILENCERS[1].y}`,
};

export type FlowKey = 'supply' | 'pa' | 'pb' | 'as' | 'br' | 'pilotIn' | 'pilotEx';

/** Маршруты частиц воздуха. */
export const ROUTES: Record<FlowKey, string> = {
  supply: `M142 440 H${PORTS.P} V${BORE.cy + 6}`,
  pa: `M${PORTS.P} ${BORE.cy + 6} H${PORTS.A} V130 H${CYL_A_X} V92`,
  pb: `M${PORTS.P} ${BORE.cy + 6} H${PORTS.B} V130 H${CYL_B_X} V92`,
  as: `M${CYL_A_X} 92 V130 H${PORTS.A} V${BORE.cy - 4} H${PORTS.S} V${SILENCERS[0].y + 6}`,
  br: `M${CYL_B_X} 92 V130 H${PORTS.B} V${BORE.cy - 4} H${PORTS.R} V${SILENCERS[1].y + 6}`,
  pilotIn: `M${PILOT_X} 440 V${BORE.cy} H${BORE.x0 + 2}`,
  pilotEx: `M${BORE.x0 + 2} ${BORE.cy} H${PILOT_X} V${PILOT_VENT.y}`,
};

export const PARTICLES_PER_ROUTE: Record<FlowKey, number> = {
  supply: 16,
  pa: 13,
  pb: 13,
  as: 11,
  br: 11,
  pilotIn: 8,
  pilotEx: 7,
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface Openings {
  pa: number;
  pb: number;
  as: number;
  br: number;
}

/**
 * Доля открытия каждого канала (0…1) при смещении золотника o, px (0…SHIFT).
 * Считается по перекрытию окна порта и пояска, а не по порогу.
 */
export const openings = (o: number): Openings => {
  const half = PORT_W / 2;
  const land = LAND_W / 2;
  const l1 = LANDS0[0] + o;
  const l2 = LANDS0[1] + o;
  // P↔A: левый край L2 уходит вправо за левый край окна P
  const pa = clamp01((l2 - land - (PORTS.P - half)) / PORT_W);
  // P↔B: правый край L2 ещё левее правого края окна P
  const pb = clamp01((PORTS.P + half - (l2 + land)) / PORT_W);
  // A↔S: правый край L1 левее правого края окна S
  const as = clamp01((PORTS.S + half - (l1 + land)) / PORT_W);
  // B↔R: правый край L3 по-прежнему за R, открытие определяется левым краем канавки
  const l3 = LANDS0[2] + o;
  const br = clamp01((l3 - land - (PORTS.R - half)) / PORT_W);
  return { pa, pb, as, br };
};

/** Положение золотника, % хода, при котором поясок начинает открывать канал. */
export const OPEN_FORWARD_PCT = ((LANDS0[1] - LAND_W / 2 - (PORTS.P - PORT_W / 2)) * -1 / SHIFT) * 100;
export const OPEN_RETURN_PCT = ((PORTS.P + PORT_W / 2 - (LANDS0[1] + LAND_W / 2)) / SHIFT) * 100;

/** Зигзаг пружины от x0 до x1. */
export const springPath = (x0: number, x1: number, turns = 9, amp = 13) => {
  const step = (x1 - x0) / (turns * 2);
  let d = `M${x0} ${BORE.cy}`;
  for (let i = 0; i < turns * 2; i++) {
    const x = x0 + step * (i + 0.5);
    const y = BORE.cy + (i % 2 === 0 ? -amp : amp);
    d += ` L${x.toFixed(1)} ${y}`;
  }
  return `${d} L${x1} ${BORE.cy}`;
};
