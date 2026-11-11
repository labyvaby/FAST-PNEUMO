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

function goTo(index: number, smooth = true) {
  const target = Math.min(slides.length - 1, Math.max(0, index));
  window.scrollTo({ top: target * slideHeight(), behavior: smooth ? 'smooth' : 'auto' });
}

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
  const index = Math.round(progress());
  if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    goTo(index + 1);
  } else if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(event.key)) {
    event.preventDefault();
    goTo(index - 1);
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

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const p = progress();
    setCurrent(Math.min(slides.length - 1, Math.max(0, Math.round(p))));
    progressBar.style.transform = `scaleX(${Math.min(1, p / (slides.length - 1))})`;
    if (stage) {
      const info = stage.frame(p, dt, now / 1000);
      hud.update(info.state, info.hud);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  preloader.classList.add('done');
};

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
