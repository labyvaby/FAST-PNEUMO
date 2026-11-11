// 3D-презентация проекта: слайды листаются поверх закреплённой сцены с распределителем.
// Навигация: прокрутка, стрелки / PageUp / PageDown / пробел, рейка справа, адрес вида #5.

import './presentation.css';
import { createHud } from './hud';
import { createStage, Stage } from './stage';

const deck = document.getElementById('deck') as HTMLElement;
const slides = Array.from(deck.querySelectorAll<HTMLElement>('.slide'));
const rail = document.getElementById('rail') as HTMLElement;
const counterNow = document.getElementById('counterNow') as HTMLElement;
const counterAll = document.getElementById('counterAll') as HTMLElement;
const counterName = document.getElementById('counterName') as HTMLElement;
const progressBar = document.getElementById('progressBar') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const preloader = document.getElementById('preloader') as HTMLElement;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const callouts = document.getElementById('callouts') as HTMLElement;
const hudRoot = document.getElementById('hud') as HTMLElement;

const pad = (value: number) => String(value).padStart(2, '0');
counterAll.textContent = pad(slides.length);

// ---------- рейка слайдов ----------
const dots = slides.map((slide, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rail-dot';
  button.setAttribute('aria-label', `Слайд ${index + 1}: ${slide.dataset.name ?? ''}`);
  const label = document.createElement('span');
  label.textContent = slide.dataset.name ?? '';
  button.appendChild(label);
  button.addEventListener('click', () => goTo(index));
  rail.appendChild(button);
  return button;
});

const slideHeight = () => deck.scrollHeight / slides.length;
const progress = () => window.scrollY / slideHeight();

// ---------- плавный переход между слайдами ----------
// Колесо и клавиши листают по одному слайду: прокрутку ведём сами, с разгоном и торможением.
// На время перехода отключаем CSS-привязку (она дёргает страницу к ближайшему слайду);
// для касаний остаётся обычная прокрутка с привязкой.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Glide {
  from: number;
  to: number;
  start: number | null;
  duration: number;
}
let glide: Glide | null = null;
let glideEndedAt = 0;
let targetIndex = 0;

const stopGlide = () => {
  if (!glide) return;
  glide = null;
  glideEndedAt = performance.now();
  document.documentElement.classList.remove('is-gliding');
};

const stepGlide = (now: number) => {
  if (!glide) return;
  if (glide.start === null) glide.start = now;
  const t = Math.min(1, Math.max(0, (now - glide.start) / glide.duration));
  window.scrollTo(0, glide.from + (glide.to - glide.from) * easeInOut(t));
  if (t >= 1) stopGlide();
};

function goTo(index: number, smooth = true) {
  targetIndex = Math.min(slides.length - 1, Math.max(0, index));
  const top = targetIndex * slideHeight();
  const distance = Math.abs(top - window.scrollY) / slideHeight();
  if (!smooth || reducedMotion || distance < 0.01) {
    stopGlide();
    window.scrollTo(0, top);
    return;
  }
  // соседний слайд — около секунды, дальний переход чуть дольше
  glide = { from: window.scrollY, to: top, start: null, duration: Math.min(1900, 820 + 260 * distance) };
  document.documentElement.classList.add('is-gliding');
}

let wheelSum = 0;
let wheelAt = 0;
window.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) return; // масштаб страницы
    event.preventDefault();
    const now = performance.now();
    // во время перехода и сразу после него гасим инерцию тачпада
    if (glide || now - glideEndedAt < 180) {
      wheelSum = 0;
      return;
    }
    if (now - wheelAt > 220) wheelSum = 0;
    wheelAt = now;
    wheelSum += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    if (Math.abs(wheelSum) < 36) return;
    const direction = Math.sign(wheelSum);
    wheelSum = 0;
    goTo(targetIndex + direction);
  },
  { passive: false },
);

document.querySelectorAll<HTMLElement>('[data-goto]').forEach((element) => {
  element.addEventListener('click', (event) => {
    event.preventDefault();
    goTo(Number(element.dataset.goto));
  });
});

let current = -1;
const setCurrent = (index: number) => {
  if (index === current) return;
  current = index;
  slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
  dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  counterNow.textContent = pad(index + 1);
  counterName.textContent = slides[index].dataset.name ?? '';
  hint.classList.toggle('off', index > 0);
  history.replaceState(null, '', `#${index + 1}`);
};

window.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    goTo(targetIndex + 1);
  } else if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(event.key)) {
    event.preventDefault();
    goTo(targetIndex - 1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    goTo(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    goTo(slides.length - 1);
  }
});

// ---------- сцена ----------
const hud = createHud(hudRoot);
let stage: Stage | null = null;
try {
  stage = createStage(canvas, callouts);
} catch (error) {
  // без WebGL презентация остаётся читаемой: текст слайдов на тёмном фоне
  document.documentElement.classList.add('no-webgl');
  console.warn('3D-сцена недоступна', error);
}

window.addEventListener('resize', () => stage?.resize());

// адрес поменяли вручную или перешли по ссылке вида #5
window.addEventListener('hashchange', () => {
  const target = Number(window.location.hash.replace('#', ''));
  if (Number.isFinite(target) && target >= 1 && target - 1 !== current) goTo(target - 1, false);
});

const start = () => {
  // после перезагрузки открываем слайд из адреса, а не место, где остановилась прокрутка
  history.scrollRestoration = 'manual';
  const fromHash = Number(window.location.hash.replace('#', ''));
  goTo(Number.isFinite(fromHash) && fromHash > 1 ? fromHash - 1 : 0, false);

  // Отметка времени кадра бывает раньше, чем performance.now() в момент запуска,
  // поэтому отсчёт начинаем с первого кадра и не допускаем отрицательного шага.
  let last: number | null = null;
  // сцена идёт за прокруткой с небольшим запаздыванием: камера не дёргается, а доезжает
  let sceneProgress: number | null = null;
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    const dt = last === null ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    stepGlide(now);
    const p = progress();
    const index = Math.min(slides.length - 1, Math.max(0, Math.round(p)));
    if (!glide) targetIndex = index;
    setCurrent(index);
    progressBar.style.transform = `scaleX(${Math.min(1, p / (slides.length - 1))})`;
    sceneProgress = sceneProgress === null || reducedMotion ? p : sceneProgress + (p - sceneProgress) * (1 - Math.exp(-dt * 5.5));
    if (!stage) return;
    try {
      const info = stage.frame(sceneProgress, dt, now / 1000);
      hud.update(info.state, info.hud);
    } catch (error) {
      // сбой 3D-сцены не должен останавливать слайды: дальше показываем только текст
      stage = null;
      document.documentElement.classList.add('no-webgl');
      console.error('3D-сцена остановлена', error);
    }
  };
  requestAnimationFrame(tick);
  preloader.classList.add('done');
};

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
