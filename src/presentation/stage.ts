// Сцена: рендер, свет, камера. Камера и эффекты плавно переходят между кадрами раскадровки
// по мере прокрутки; движение самой модели идёт по времени.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Mode, ValveState, sample, smoothstep } from './kinematics';
import { BASE_FX, CALLOUTS, Hud, SHOTS, Shot } from './shots';
import { AnchorId, Fx, createValve } from './valve3d';

export interface FrameInfo {
  state: ValveState;
  hud: Hud;
}

export interface Stage {
  frame: (progress: number, dt: number, time: number) => FrameInfo;
  resize: () => void;
}

const FX_KEYS = Object.keys(BASE_FX) as (keyof Fx)[];
const fxOf = (shot: Shot): Fx => ({ ...BASE_FX, ...shot.fx });

export const createStage = (canvas: HTMLCanvasElement, calloutRoot: HTMLElement): Stage => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060b);
  const fog = new THREE.Fog(0x05060b, 30, 70);
  scene.fog = fog;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(5, 9, 10);
  scene.add(key);
  const rimTeal = new THREE.PointLight(0x1fb6ce, 220, 40);
  rimTeal.position.set(-9, 4, 7);
  scene.add(rimTeal);
  const rimViolet = new THREE.PointLight(0x8b6cff, 200, 40);
  rimViolet.position.set(9, -3, 6);
  scene.add(rimViolet);

  const grid = new THREE.GridHelper(120, 120, 0x243061, 0x121833);
  grid.position.y = -4.8;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.55;
  scene.add(grid);

  const valve = createValve();
  scene.add(valve.group);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.42, 0.7, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- подписи к деталям ----------
  const labels = new Map<AnchorId, HTMLElement>();
  (Object.keys(CALLOUTS) as AnchorId[]).forEach((id) => {
    const element = document.createElement('span');
    element.className = id.startsWith('port') ? 'callout callout-port' : 'callout';
    element.textContent = CALLOUTS[id];
    calloutRoot.appendChild(element);
    labels.set(id, element);
  });

  let width = 1;
  let height = 1;
  let mobile = false;
  let distanceScale = 1;

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    const aspect = width / height;
    mobile = width < 700 || aspect < 1.1;
    distanceScale = mobile ? Math.max(1, 1.05 / aspect) : Math.max(1, 1.6 / aspect);
    // на узком экране камера отъезжает — туман отодвигаем вместе с ней
    fog.near = 30 * distanceScale;
    fog.far = 70 * distanceScale;
    // выше 1.5 картинка почти не меняется, а свечение и сглаживание обходятся вдвое дороже
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = aspect;
    // модель уходит из-под текста: на широком экране — вправо, на узком — вверх
    if (mobile) camera.setViewOffset(width, height, 0, height * 0.2, width, height);
    else camera.setViewOffset(width, height, -width * 0.2, 0, width, height);
    camera.updateProjectionMatrix();
  };
  resize();

  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  window.addEventListener('pointermove', (event) => {
    pointerTarget.set((event.clientX / width) * 2 - 1, (event.clientY / height) * 2 - 1);
  });

  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const fx: Fx = { ...BASE_FX };
  let mode: Mode = SHOTS[0].mode;
  let clock = 0;
  // замер скорости: если первые кадры идут медленно, отключаем свечение и снижаем разрешение
  let lite = false;
  let measured = 0;
  let measuredTime = 0;
  let lastStamp = 0;

  const frame = (progress: number, dt: number, time: number): FrameInfo => {
    const last = SHOTS.length - 1;
    const p = Math.min(last, Math.max(0, progress));
    const i0 = Math.floor(p);
    const i1 = Math.min(last, i0 + 1);
    const f = smoothstep(0, 1, p - i0);
    const a = SHOTS[i0];
    const b = SHOTS[i1];
    const active = SHOTS[Math.round(p)];

    const fxA = fxOf(a);
    const fxB = fxOf(b);
    FX_KEYS.forEach((name) => { fx[name] = fxA[name] + (fxB[name] - fxA[name]) * f; });

    if (active.mode !== mode) {
      mode = active.mode;
      clock = 0;
    }
    clock += dt;
    const state = sample(mode, clock);
    valve.update(state, fx, dt, time);

    // камера
    pointer.lerp(pointerTarget, Math.min(1, dt * 3));
    look.set(a.look[0] + (b.look[0] - a.look[0]) * f, a.look[1] + (b.look[1] - a.look[1]) * f, a.look[2] + (b.look[2] - a.look[2]) * f);
    camPos.set(a.cam[0] + (b.cam[0] - a.cam[0]) * f, a.cam[1] + (b.cam[1] - a.cam[1]) * f, a.cam[2] + (b.cam[2] - a.cam[2]) * f);
    const orbit = a.orbit + (b.orbit - a.orbit) * f;
    offset.copy(camPos).sub(look).multiplyScalar(distanceScale);
    const yaw = (reduced ? 0 : Math.sin(time * 0.22) * orbit) + pointer.x * 0.07;
    offset.applyAxisAngle(up, yaw);
    offset.y += pointer.y * -0.6;
    camera.position.copy(look).add(offset);
    camera.lookAt(look);

    // подписи: видны, когда слайд встал на место
    const settled = Math.abs(p - Math.round(p)) < 0.22;
    labels.forEach((element, id) => {
      const show = settled && active.callouts.includes(id);
      element.classList.toggle('on', show);
      if (!show) return;
      valve.anchor(id, projected).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    });

    const stamp = performance.now();
    const gap = stamp - lastStamp;
    lastStamp = stamp;
    // паузы длиннее 250 мс — это фоновая вкладка, а не медленная видеокарта
    if (!lite && measured < 90 && gap > 0 && gap < 250) {
      measured++;
      measuredTime += gap;
      if (measured === 90 && measuredTime / measured > 42) {
        lite = true;
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
      }
    }

    if (mobile || lite) renderer.render(scene, camera);
    else composer.render(dt);

    return { state, hud: active.hud };
  };

  return { frame, resize };
};
