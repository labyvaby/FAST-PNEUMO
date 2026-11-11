// 3D-модель распределителя 5/2 в разрезе. Вся геометрия строится кодом.
//
// Оси: X — вдоль золотника, Y — вверх, Z — к зрителю. Корпус разрезан плоскостью Z = 0:
// задняя половина — металл с пазами каналов, передняя — стеклянная крышка, которую можно снять.
// Каналы: снизу R · P · S (выхлоп, питание, выхлоп), сверху A · B (к цилиндру).
// Золотник с тремя поясками и поршнем пилота слева, пружина справа. Ход вправо = включение.
//   покой:      P → B, A → R
//   включено:   P → A, B → S

import * as THREE from 'three';
import { ValveState, smoothstep } from './kinematics';

export interface Fx {
  /** снять стеклянную крышку */
  explode: number;
  /** частицы воздуха */
  particles: number;
  glowCoil: number;
  glowPilot: number;
  glowSpool: number;
  glowSpring: number;
  /** контроллер и сигнальный провод */
  signal: number;
  /** подводящая линия с регулятором */
  line: number;
  /** отметка 90 % хода */
  marker: number;
  /** подсветка калибруемых параметров: канал d и пружина F0 */
  tune: number;
  /** каркасный режим */
  wire: number;
}

export type AnchorId =
  | 'portR' | 'portA' | 'portP' | 'portB' | 'portS'
  | 'coil' | 'pilot' | 'spool' | 'spring' | 'cyl' | 'orifice' | 'ctrl' | 'line' | 't90';

export interface Valve3D {
  group: THREE.Group;
  update: (state: ValveState, fx: Fx, dt: number, time: number) => void;
  anchor: (id: AnchorId, out: THREE.Vector3) => THREE.Vector3;
}

const STROKE = 1.2;
const X0 = -5.6;
const X1 = 4.6;
const BORE_X0 = -5.2;
const BORE_X1 = 4.2;
/** середина паза каналов по глубине */
const ZC = -0.25;
/** сдвиг, чтобы корпус стоял по центру сцены */
const SHIFT = 0.5;

const TEAL = new THREE.Color(0x1fb6ce);
const EXHAUST = new THREE.Color(0x5d6079);
const VIOLET = new THREE.Color(0x8b6cff);
const AMBER = new THREE.Color(0xf2b43c);
const GREEN = new THREE.Color(0x44c18a);

const v = (x: number, y: number, z = ZC) => new THREE.Vector3(x, y, z);

/** точки, из которых «вырастают» сигнальный провод и подводящая линия */
const SIGNAL_PIVOT = v(-5.66, 3.04);
const LINE_PIVOT = v(0, -2.3);

/** Масштабирует группу относительно точки pivot: 0 — скрыта, 1 — в полный размер. */
const scaleAbout = (object: THREE.Object3D, pivot: THREE.Vector3, amount: number) => {
  const scale = Math.max(0.0001, amount);
  object.visible = amount > 0.02;
  object.scale.setScalar(scale);
  object.position.copy(pivot).multiplyScalar(1 - scale);
};

const boxGeo = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geometry;
};

const cylX = (radius: number, x0: number, x1: number, segments = 40) => {
  const geometry = new THREE.CylinderGeometry(radius, radius, x1 - x0, segments);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate((x0 + x1) / 2, 0, 0);
  return geometry;
};

const cylY = (radius: number, y0: number, y1: number, x = 0, z = ZC, segments = 32) => {
  const geometry = new THREE.CylinderGeometry(radius, radius, y1 - y0, segments);
  geometry.translate(x, (y0 + y1) / 2, z);
  return geometry;
};

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private radius: number, private turns: number) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const angle = t * this.turns * Math.PI * 2;
    return target.set(t, this.radius * Math.cos(angle), this.radius * Math.sin(angle));
  }
}

const dotTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,.75)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

interface Flow {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  curve: THREE.Curve<THREE.Vector3>;
  seeds: Float32Array;
  phase: number;
}

export const createValve = (): Valve3D => {
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.position.x = SHIFT;
  group.add(root);

  // ---------- материалы ----------
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1d30, metalness: 0.6, roughness: 0.48 });
  const cutMat = new THREE.MeshStandardMaterial({ color: 0x2c3252, metalness: 0.35, roughness: 0.6 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d0f1c, metalness: 0.4, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23263a, metalness: 0.7, roughness: 0.4 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xdfe1ec, metalness: 0.95, roughness: 0.2, emissive: TEAL, emissiveIntensity: 0 });
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x9a9db2, metalness: 0.95, roughness: 0.28 });
  const pilotPistonMat = new THREE.MeshStandardMaterial({ color: 0x8b6cff, metalness: 0.7, roughness: 0.3, emissive: VIOLET, emissiveIntensity: 0.15 });
  const springMat = new THREE.MeshStandardMaterial({ color: 0x44c18a, metalness: 0.8, roughness: 0.3, emissive: GREEN, emissiveIntensity: 0.1 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xb46a22, metalness: 0.75, roughness: 0.35, emissive: AMBER, emissiveIntensity: 0.05 });
  const fittingMat = new THREE.MeshStandardMaterial({ color: 0x9ea3bb, metalness: 0.92, roughness: 0.28 });
  const silencerMat = new THREE.MeshStandardMaterial({ color: 0xa98a48, metalness: 0.8, roughness: 0.45 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa8dcff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide,
  });
  const barrelMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe6ff, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a5285, transparent: true, opacity: 0.75 });
  const coverEdgeMat = new THREE.LineBasicMaterial({ color: 0x1fb6ce, transparent: true, opacity: 0.45 });
  const wireable: THREE.MeshStandardMaterial[] = [bodyMat, cutMat, floorMat, darkMat, steelMat, rodMat, pilotPistonMat, coilMat, fittingMat, silencerMat];

  const gasMat = (color: THREE.Color, opacity: number) =>
    new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

  const addSolid = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], edges = true) => {
    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
    if (edges) parent.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMat));
    return mesh;
  };

  // ---------- корпус: задняя половина ----------
  const sectionMats = [bodyMat, bodyMat, bodyMat, bodyMat, cutMat, bodyMat];
  const plateMats = [bodyMat, bodyMat, bodyMat, bodyMat, floorMat, bodyMat];
  addSolid(root, boxGeo(X0, X1, -1.5, 1.5, -1.2, -0.5), plateMats);
  // верхние острова: между ними каналы пилота, A и B
  ([[X0, -5.12], [-4.88, -1.45], [-0.95, 0.95], [1.45, X1]] as const).forEach(([a, b]) =>
    addSolid(root, boxGeo(a, b, 0.5, 1.5, -0.5, 0), sectionMats));
  // нижние острова: между ними каналы R, P и S
  ([[X0, -2.65], [-2.15, -0.25], [0.25, 2.15], [2.65, X1]] as const).forEach(([a, b]) =>
    addSolid(root, boxGeo(a, b, -1.5, -0.5, -0.5, 0), sectionMats));
  addSolid(root, boxGeo(X0, BORE_X0, -0.5, 0.5, -0.5, 0), sectionMats);
  addSolid(root, boxGeo(BORE_X1, X1, -0.5, 0.5, -0.5, 0), sectionMats);

  // ---------- стеклянная крышка ----------
  const cover = new THREE.Group();
  const coverGeo = boxGeo(X0, X1, -1.5, 1.5, 0, 1.2);
  cover.add(new THREE.Mesh(coverGeo, glassMat));
  cover.add(new THREE.LineSegments(new THREE.EdgesGeometry(coverGeo), coverEdgeMat));
  root.add(cover);

  // ---------- штуцеры и глушители ----------
  [-1.2, 1.2].forEach((x) => addSolid(root, cylY(0.3, 1.5, 2.0, x), fittingMat, false));
  [-2.4, 0, 2.4].forEach((x) => addSolid(root, cylY(0.3, -2.0, -1.5, x), fittingMat, false));
  [-2.4, 2.4].forEach((x) => addSolid(root, cylY(0.37, -2.75, -2.0, x), silencerMat, false));
  addSolid(root, cylY(0.36, -2.3, -2.0, 0), darkMat, false);

  // ---------- золотник ----------
  const spool = new THREE.Group();
  root.add(spool);
  spool.add(new THREE.Mesh(cylX(0.17, -4.9, 2.1), rodMat));
  [-3.0, -0.6, 1.8].forEach((x) => {
    spool.add(new THREE.Mesh(cylX(0.48, x - 0.3, x + 0.3), steelMat));
    spool.add(new THREE.Mesh(cylX(0.492, x - 0.05, x + 0.05), darkMat));
  });
  spool.add(new THREE.Mesh(cylX(0.48, -4.9, -4.3), pilotPistonMat));

  // полости между поясками едут вместе с золотником
  const chamber1Mat = gasMat(EXHAUST, 0.3);
  const chamber2Mat = gasMat(TEAL, 0.3);
  spool.add(new THREE.Mesh(boxGeo(-2.7, -0.9, -0.46, 0.46, -0.46, -0.02), chamber1Mat));
  spool.add(new THREE.Mesh(boxGeo(-0.3, 1.5, -0.46, 0.46, -0.46, -0.02), chamber2Mat));

  // ---------- пружина ----------
  const spring = new THREE.Mesh(new THREE.TubeGeometry(new Helix(0.33, 7), 260, 0.045, 8), springMat);
  root.add(spring);

  // ---------- воздух в каналах ----------
  const gasAMat = gasMat(EXHAUST, 0.3);
  const gasBMat = gasMat(TEAL, 0.3);
  const gasPMat = gasMat(TEAL, 0.34);
  const gasRMat = gasMat(EXHAUST, 0.2);
  const gasSMat = gasMat(EXHAUST, 0.2);
  root.add(new THREE.Mesh(boxGeo(-1.45, -0.95, 0.5, 1.5, -0.46, -0.02), gasAMat));
  root.add(new THREE.Mesh(boxGeo(0.95, 1.45, 0.5, 1.5, -0.46, -0.02), gasBMat));
  root.add(new THREE.Mesh(boxGeo(-0.25, 0.25, -1.5, -0.5, -0.46, -0.02), gasPMat));
  root.add(new THREE.Mesh(boxGeo(-2.65, -2.15, -1.5, -0.5, -0.46, -0.02), gasRMat));
  root.add(new THREE.Mesh(boxGeo(2.15, 2.65, -1.5, -0.5, -0.46, -0.02), gasSMat));

  // пилотная камера и канал пилота
  const pilotGasMat = gasMat(VIOLET, 0.1);
  const pilotGas = new THREE.Mesh(boxGeo(0, 1, -0.46, 0.46, -0.46, -0.02), pilotGasMat);
  pilotGas.position.x = BORE_X0;
  root.add(pilotGas);
  const pilotChannelMat = gasMat(VIOLET, 0.1);
  root.add(new THREE.Mesh(boxGeo(-5.12, -4.88, 0.5, 1.5, -0.46, -0.02), pilotChannelMat));

  // ---------- пилот: катушка ----------
  const coil = new THREE.Group();
  root.add(coil);
  addSolid(coil, boxGeo(-5.55, -4.45, 1.5, 1.95, -0.85, 0.35), darkMat);
  coil.add(new THREE.Mesh(cylY(0.42, 1.95, 3.05, -5.0), coilMat));
  for (let i = 0; i < 9; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.022, 8, 40), darkMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-5.0, 2.06 + i * 0.11, ZC);
    coil.add(ring);
  }
  coil.add(new THREE.Mesh(cylY(0.46, 3.05, 3.22, -5.0), darkMat));
  coil.add(new THREE.Mesh(boxGeo(-5.66, -5.42, 2.86, 3.2, ZC - 0.16, ZC + 0.16), darkMat));
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x3a3d52 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), ledMat);
  led.position.set(-5.0, 3.25, ZC + 0.22);
  coil.add(led);

  // кольцо на канале пилота — калибруемый диаметр d
  const orificeMat = new THREE.MeshBasicMaterial({ color: VIOLET.clone(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const orifice = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 10, 48), orificeMat);
  orifice.rotation.x = Math.PI / 2;
  orifice.position.set(-5.0, 1.0, ZC);
  root.add(orifice);

  // ---------- цилиндр ----------
  const cyl = new THREE.Group();
  cyl.position.set(0, 4.3, ZC);
  root.add(cyl);
  const barrelGeo = new THREE.CylinderGeometry(0.62, 0.62, 4.9, 48, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  cyl.add(new THREE.Mesh(barrelGeo, barrelMat));
  cyl.add(new THREE.Mesh(cylX(0.67, -2.75, -2.45), darkMat));
  cyl.add(new THREE.Mesh(cylX(0.67, 2.45, 2.75), darkMat));
  const piston = new THREE.Group();
  cyl.add(piston);
  piston.add(new THREE.Mesh(cylX(0.57, -0.14, 0.14), steelMat));
  piston.add(new THREE.Mesh(cylX(0.13, 0.14, 4.3, 24), rodMat));
  piston.add(new THREE.Mesh(boxGeo(4.3, 4.52, -0.55, 0.55, -0.55, 0.55), darkMat));
  const cylGasLMat = gasMat(EXHAUST, 0.28);
  const cylGasRMat = gasMat(TEAL, 0.28);
  const cylGasL = new THREE.Mesh(cylX(0.55, 0, 1, 32), cylGasLMat);
  const cylGasR = new THREE.Mesh(cylX(0.55, 0, 1, 32), cylGasRMat);
  cyl.add(cylGasL, cylGasR);
  // стойки цилиндра
  [-2.6, 2.6].forEach((x) => root.add(new THREE.Mesh(cylY(0.08, 1.5, 3.66, x, -0.7), darkMat)));

  // трубки A и B к цилиндру
  const tubeAPts = [v(-1.2, 2.0), v(-1.2, 2.6), v(-1.9, 3.2), v(-2.2, 3.45), v(-2.2, 3.7)];
  const tubeBPts = tubeAPts.map((p) => v(-p.x, p.y));
  const tubeMat = (color: THREE.Color) =>
    new THREE.MeshStandardMaterial({ color: color.clone(), emissive: color.clone(), emissiveIntensity: 0.3, metalness: 0.1, roughness: 0.4, transparent: true, opacity: 0.9 });
  const tubeAMat = tubeMat(EXHAUST);
  const tubeBMat = tubeMat(TEAL);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tubeAPts, false, 'catmullrom', 0.2), 40, 0.09, 12), tubeAMat));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tubeBPts, false, 'catmullrom', 0.2), 40, 0.09, 12), tubeBMat));

  // ---------- подводящая линия с регулятором ----------
  const lineRig = new THREE.Group();
  root.add(lineRig);
  const linePts = [v(0, -2.3), v(0, -3.1), v(-0.8, -3.7), v(-4.5, -3.7), v(-6.3, -3.7)];
  const lineMat = tubeMat(TEAL);
  lineRig.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(linePts, false, 'catmullrom', 0.15), 60, 0.11, 12), lineMat));
  addSolid(lineRig, boxGeo(-7.5, -6.3, -4.3, -3.1, ZC - 0.45, ZC + 0.45), darkMat);
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 32), new THREE.MeshStandardMaterial({ color: 0xf4f2ee, metalness: 0.2, roughness: 0.5, emissive: 0xf4f2ee, emissiveIntensity: 0.25 }));
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(-6.9, -3.7, ZC + 0.5);
  lineRig.add(gauge);

  // ---------- контроллер и сигнальный провод ----------
  const signalRig = new THREE.Group();
  root.add(signalRig);
  addSolid(signalRig, boxGeo(-10.2, -8.95, 3.15, 4.05, ZC - 0.4, ZC + 0.4), darkMat);
  const wireCurve = new THREE.CatmullRomCurve3([v(-8.95, 3.6), v(-7.6, 3.6), v(-6.5, 3.25), v(-5.66, 3.04)], false, 'catmullrom', 0.3);
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x6b5320, emissive: AMBER, emissiveIntensity: 0.1, metalness: 0.3, roughness: 0.5 });
  signalRig.add(new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 40, 0.045, 10), wireMat));
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
  signalRig.add(pulse);
  const ctrlLedMat = new THREE.MeshBasicMaterial({ color: 0x3a3d52 });
  const ctrlLed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), ctrlLedMat);
  ctrlLed.position.set(-9.3, 3.85, ZC + 0.42);
  signalRig.add(ctrlLed);

  // ---------- отметка 90 % хода ----------
  const markerMat = new THREE.MeshBasicMaterial({ color: AMBER.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const marker = new THREE.Mesh(boxGeo(2.1 + 0.9 * STROKE - 0.02, 2.1 + 0.9 * STROKE + 0.02, -0.7, 0.7, -0.6, 0.7), markerMat);
  root.add(marker);

  // ---------- частицы воздуха ----------
  const sprite = dotTexture();
  const makeFlow = (points: THREE.Vector3[], color: THREE.Color, count: number, size: number): Flow => {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.12);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = (i + Math.random() * 0.8) / count;
      seeds[i * 4 + 1] = (Math.random() - 0.5) * 0.2;
      seeds[i * 4 + 2] = (Math.random() - 0.5) * 0.2;
      seeds[i * 4 + 3] = (Math.random() - 0.5) * 0.2;
    }
    const material = new THREE.PointsMaterial({
      color: color.clone(), size, map: sprite, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const object = new THREE.Points(geometry, material);
    object.frustumCulled = false;
    root.add(object);
    return { points: object, material, curve, seeds, phase: Math.random() };
  };

  const mirror = (points: THREE.Vector3[]) => points.map((p) => v(-p.x, p.y));
  const supplyAPts = [v(0, -2.9), v(0, -0.35), v(-0.6, 0.02), v(-1.2, 0.4), ...tubeAPts];
  const exhaustAPts = [...tubeAPts.slice().reverse(), v(-1.2, 0.4), v(-1.8, -0.02), v(-2.4, -0.4), v(-2.4, -3.0)];
  const supplyA = makeFlow(supplyAPts, new THREE.Color(0x7fe9f7), 46, 0.2);
  const supplyB = makeFlow(mirror(supplyAPts), new THREE.Color(0x7fe9f7), 46, 0.2);
  const exhaustA = makeFlow(exhaustAPts, new THREE.Color(0xb9bbd0), 40, 0.17);
  const exhaustB = makeFlow(mirror(exhaustAPts), new THREE.Color(0xb9bbd0), 40, 0.17);
  const pilotFlow = makeFlow([v(-5.0, 1.95), v(-5.0, 0.7), v(-5.03, 0.15), v(-5.05, -0.15)], new THREE.Color(0xb7a4ff), 14, 0.16);

  const tmp = new THREE.Vector3();
  const stepFlow = (flow: Flow, speed: number, opacity: number, dt: number) => {
    flow.material.opacity = opacity;
    flow.points.visible = opacity > 0.01;
    if (!flow.points.visible) return;
    flow.phase = (flow.phase + speed * dt) % 1;
    const attribute = flow.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = attribute.count;
    for (let i = 0; i < count; i++) {
      const u = (flow.seeds[i * 4] + flow.phase) % 1;
      flow.curve.getPointAt(u, tmp);
      attribute.setXYZ(i, tmp.x + flow.seeds[i * 4 + 1], tmp.y + flow.seeds[i * 4 + 2], tmp.z + flow.seeds[i * 4 + 3]);
    }
    attribute.needsUpdate = true;
  };

  // ---------- состояние ----------
  let pistonQ = 0;
  let flowLevel = 0;
  let prevX = 0;
  let spoolSpeed = 0;
  let pulseT = 1;
  let prevCommand = false;
  let wireframe = false;
  const colorA = new THREE.Color();
  const colorB = new THREE.Color();

  const update = (state: ValveState, fx: Fx, dt: number, time: number) => {
    const shift = state.x * STROKE;
    spool.position.x = shift;
    spring.position.x = 2.1 + shift;
    spring.scale.x = BORE_X1 - (2.1 + shift);
    pilotGas.scale.x = Math.max(0.001, -4.9 + shift - BORE_X0);

    // какая полость под давлением: до середины хода P → B, после — P → A
    const c1 = smoothstep(0.46, 0.54, state.x);
    colorA.copy(EXHAUST).lerp(TEAL, c1);
    colorB.copy(TEAL).lerp(EXHAUST, c1);
    chamber1Mat.color.copy(colorA);
    chamber2Mat.color.copy(colorB);
    gasAMat.color.copy(colorA);
    gasBMat.color.copy(colorB);
    cylGasLMat.color.copy(colorA);
    cylGasRMat.color.copy(colorB);
    tubeAMat.color.copy(colorA);
    tubeAMat.emissive.copy(colorA);
    tubeBMat.color.copy(colorB);
    tubeBMat.emissive.copy(colorB);

    // поршень цилиндра догоняет распределитель с постоянной скоростью
    const step = Math.min(Math.abs(c1 - pistonQ), dt / 0.6) * Math.sign(c1 - pistonQ);
    pistonQ += step;
    const moving = Math.abs(c1 - pistonQ) > 0.002 ? 1 : 0;
    flowLevel += (moving - flowLevel) * Math.min(1, dt * 7);
    const pistonX = -1.3 + 2.6 * pistonQ;
    piston.position.x = pistonX;
    cylGasL.position.x = -2.45;
    cylGasL.scale.x = Math.max(0.001, pistonX - 0.14 + 2.45);
    cylGasR.position.x = pistonX + 0.14;
    cylGasR.scale.x = Math.max(0.001, 2.45 - (pistonX + 0.14));

    // выхлопные каналы ярче, когда через них идёт воздух
    gasRMat.opacity = 0.12 + 0.3 * (1 - c1) * flowLevel;
    gasSMat.opacity = 0.12 + 0.3 * c1 * flowLevel;

    // частицы: воздух идёт, пока поршень в движении
    const rush = 0.22 + 0.78 * flowLevel;
    const speed = 0.1 + 0.5 * flowLevel;
    stepFlow(supplyA, speed, fx.particles * c1 * rush, dt);
    stepFlow(exhaustB, speed, fx.particles * c1 * rush * 0.8, dt);
    stepFlow(supplyB, speed, fx.particles * (1 - c1) * rush, dt);
    stepFlow(exhaustA, speed, fx.particles * (1 - c1) * rush * 0.8, dt);
    const pilotFilling = state.forward ? state.armature * (1 - state.pilot * 0.75) : 0;
    stepFlow(pilotFlow, 0.9, fx.particles * pilotFilling, dt);

    // пилот
    const pilotGlow = 0.7 + 0.9 * fx.glowPilot;
    pilotGasMat.opacity = Math.min(0.85, 0.06 + 0.5 * state.pilot * pilotGlow);
    pilotChannelMat.opacity = Math.min(0.85, 0.05 + 0.45 * state.armature * pilotGlow);
    pilotPistonMat.emissiveIntensity = 0.12 + 0.5 * state.pilot * fx.glowPilot;
    coilMat.emissiveIntensity = 0.04 + state.current * (0.7 + 1.5 * fx.glowCoil);
    ledMat.color.setHex(state.armature > 0.5 ? 0x7dffb2 : 0x3a3d52);

    // золотник подсвечивается, когда движется
    const speedNow = dt > 0 ? Math.min(1, (Math.abs(state.x - prevX) / dt) * 0.6) : 0;
    prevX = state.x;
    spoolSpeed += (speedNow - spoolSpeed) * Math.min(1, dt * 10);
    steelMat.emissiveIntensity = fx.glowSpool * (0.06 + 0.7 * spoolSpeed);

    // пружина и канал пилота — параметры калибровки
    const breathe = 0.5 + 0.5 * Math.sin(time * 3.2);
    springMat.emissiveIntensity = 0.1 + fx.glowSpring * (0.35 + 0.9 * breathe) + fx.tune * 0.6 * breathe;
    orificeMat.opacity = fx.tune * (0.55 + 0.45 * breathe);
    orifice.scale.setScalar(0.8 + 0.5 * (0.5 + 0.5 * Math.sin(time * 1.6)));

    // крышка
    cover.position.z = fx.explode * 2.4;
    glassMat.opacity = 0.075 * (1 - fx.explode);
    coverEdgeMat.opacity = 0.45 * (1 - fx.explode);
    cover.visible = fx.explode < 0.985;

    // сигнал от контроллера
    if (state.command && !prevCommand) pulseT = 0;
    prevCommand = state.command;
    pulseT = Math.min(1, pulseT + dt / 0.45);
    scaleAbout(signalRig, SIGNAL_PIVOT, fx.signal);
    pulse.visible = pulseT < 1;
    wireCurve.getPointAt(pulseT, pulse.position);
    wireMat.emissiveIntensity = state.command ? 0.9 : 0.1;
    ctrlLedMat.color.setHex(state.command ? 0xffc65a : 0x3a3d52);

    // подводящая линия
    scaleAbout(lineRig, LINE_PIVOT, fx.line);

    // отметка 90 %: вспыхивает, когда поясок её проходит
    const flash = state.forward && state.x > 0.8 ? Math.max(0, 1 - Math.abs(state.x - 0.9) * 9) : 0;
    markerMat.opacity = fx.marker * (0.28 + 0.6 * flash);

    // каркасный режим
    const wantWire = fx.wire > 0.5;
    if (wantWire !== wireframe) {
      wireframe = wantWire;
      wireable.forEach((material) => { material.wireframe = wantWire; });
      springMat.wireframe = wantWire;
    }
  };

  const anchors: Record<AnchorId, () => THREE.Vector3> = {
    portR: () => tmp.set(-2.4, -1.02, 0.02),
    portP: () => tmp.set(0, -1.02, 0.02),
    portS: () => tmp.set(2.4, -1.02, 0.02),
    portA: () => tmp.set(-1.2, 1.02, 0.02),
    portB: () => tmp.set(1.2, 1.02, 0.02),
    coil: () => tmp.set(-5.0, 2.55, 0.2),
    pilot: () => tmp.set(-5.05, 0, 0.1),
    spool: () => tmp.set(-0.6 + spool.position.x, 0, 0.5),
    spring: () => tmp.set(3.3 + spool.position.x * 0.5, 0, 0.36),
    cyl: () => tmp.set(0, 4.95, ZC),
    orifice: () => tmp.set(-5.0, 1.0, 0.05),
    ctrl: () => tmp.set(-9.55, 4.1, ZC),
    line: () => tmp.set(-3.4, -3.7, ZC),
    t90: () => tmp.set(2.1 + 0.9 * STROKE, 0.72, 0.5),
  };

  const anchor = (id: AnchorId, out: THREE.Vector3) => {
    out.copy(anchors[id]());
    return root.localToWorld(out);
  };

  return { group, update, anchor };
};
