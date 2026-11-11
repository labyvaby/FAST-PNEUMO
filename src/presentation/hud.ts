// Панель замедленного повтора: модельное время, текущая фаза, полоса фаз и мини-осциллограмма.
// Кривые берутся из той же физической модели, что двигает 3D-золотник.

import { MODEL, ValveState } from './kinematics';
import type { Hud } from './shots';
import { VALVE_CONST } from '../lib/valveModel';

const FORWARD_PHASES = ['исходное положение', 'ток катушки растёт', 'якорь пилота открывается', 'камера наполняется', 'золотник идёт до упора'];
const RETURN_PHASES = ['исходное положение', 'ток катушки спадает', 'якорь пилота закрывается', 'камера стравливается', 'пружина возвращает золотник'];
const COLORS = { cmd: '#F2B43C', cur: '#44C18A', pil: '#8B6CFF', pos: '#1FB6CE' };
const TAU_MS = (VALVE_CONST.coilInductanceH / VALVE_CONST.coilResistanceOhm) * 1000;

interface Trace {
  tMax: number;
  cur: number[];
  pil: number[];
  pos: number[];
}

const SAMPLES = 180;

const buildTrace = (forward: boolean): Trace => {
  const result = forward ? MODEL.fwd : MODEL.ret;
  const tMax = result.tTotal * 1.2;
  const trace: Trace = { tMax, cur: [], pil: [], pos: [] };
  let index = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * tMax;
    while (index < result.series.length - 2 && result.series[index + 1].t < t) index++;
    const a = result.series[index];
    const b = result.series[Math.min(result.series.length - 1, index + 1)];
    const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1)));
    trace.cur.push(forward ? 1 - Math.exp(-t / TAU_MS) : Math.exp(-t / TAU_MS));
    trace.pil.push((a.p + (b.p - a.p) * f) / MODEL.supplyBar);
    trace.pos.push((a.x + (b.x - a.x) * f) / 100);
  }
  return trace;
};

const format = (value: number, digits = 2) => value.toFixed(digits).replace('.', ',');

export const createHud = (root: HTMLElement) => {
  const slowEl = root.querySelector<HTMLElement>('[data-hud="slow"]');
  const timeEl = root.querySelector<HTMLElement>('[data-hud="time"]');
  const phaseEl = root.querySelector<HTMLElement>('[data-hud="phase"]');
  const barEl = root.querySelector<HTMLElement>('[data-hud="bar"]');
  const cursorEl = root.querySelector<HTMLElement>('[data-hud="cursor"]');
  const segments = Array.from(root.querySelectorAll<HTMLElement>('[data-hud="bar"] i'));
  const canvas = root.querySelector<HTMLCanvasElement>('canvas');
  const ctx = canvas?.getContext('2d') ?? null;
  const traces = { forward: buildTrace(true), back: buildTrace(false) };
  let shownForward: boolean | null = null;

  const setSegments = (forward: boolean) => {
    const result = forward ? MODEL.fwd : MODEL.ret;
    const parts = [result.tCoil, result.tArmature, result.tFill, result.tMove];
    segments.forEach((segment, i) => { segment.style.flexGrow = String(Math.max(0.01, parts[i] ?? 0)); });
    barEl?.classList.toggle('is-return', !forward);
  };

  const drawScope = (state: ValveState) => {
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const forward = state.forward || state.slow === 0;
    const trace = forward ? traces.forward : traces.back;
    const band = h / 4;
    const pad = 5;
    const xOf = (t: number) => (t / trace.tMax) * w;
    const yOf = (row: number, value: number) => row * band + band - pad - value * (band - pad * 2);
    const cursorX = state.slow === 0 ? 0 : Math.min(w, xOf(state.tMs));

    // сетка
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    for (let row = 1; row < 4; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * band);
      ctx.lineTo(w, row * band);
      ctx.stroke();
    }

    const drawLine = (row: number, values: number[], color: string) => {
      const path = (limit: number) => {
        ctx.beginPath();
        values.forEach((value, i) => {
          const x = (i / SAMPLES) * w;
          if (x > limit + 1) return;
          if (i === 0) ctx.moveTo(x, yOf(row, value));
          else ctx.lineTo(x, yOf(row, value));
        });
      };
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.28;
      path(w);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      path(cursorX);
      ctx.stroke();
    };

    // команда — ступенька в момент t = 0
    const command = trace.pos.map(() => (forward ? 1 : 0));
    drawLine(0, command, COLORS.cmd);
    drawLine(1, trace.cur, COLORS.cur);
    drawLine(2, trace.pil, COLORS.pil);
    drawLine(3, trace.pos, COLORS.pos);

    // порог 90 % / 10 % и момент его прохождения
    const level = forward ? 0.9 : 0.1;
    const tCross = forward ? MODEL.t90 : MODEL.t10;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(244,242,238,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yOf(3, level));
    ctx.lineTo(w, yOf(3, level));
    ctx.moveTo(xOf(tCross), 0);
    ctx.lineTo(xOf(tCross), h);
    ctx.stroke();
    ctx.setLineDash([]);

    // курсор времени
    ctx.strokeStyle = 'rgba(244,242,238,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, h);
    ctx.stroke();

    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(244,242,238,.7)';
    ctx.textBaseline = 'top';
    const label = forward ? `t90 = ${format(MODEL.t90, 1)} мс` : `t10 = ${format(MODEL.t10, 1)} мс`;
    const labelWidth = ctx.measureText(label).width;
    ctx.fillText(label, Math.min(w - labelWidth - 4, xOf(tCross) + 5), 3);
  };

  const update = (state: ValveState, hud: Hud) => {
    root.classList.toggle('on', hud !== 'none');
    root.classList.toggle('with-scope', hud === 'scope');
    if (hud === 'none') return;

    const modelled = state.slow > 0;
    const forward = state.forward || !modelled;
    if (forward !== shownForward) {
      shownForward = forward;
      setSegments(forward);
    }
    const result = forward ? MODEL.fwd : MODEL.ret;
    if (slowEl) slowEl.textContent = modelled ? `замедлено ×${Math.round(state.slow)}` : 'возврат без замедления';
    if (timeEl) timeEl.textContent = modelled ? `t = ${format(Math.min(state.tMs, result.tTotal * 1.2))} мс` : 't = 0 мс';
    const names = forward ? FORWARD_PHASES : RETURN_PHASES;
    const done = modelled && state.phase === 0 && state.tMs >= result.tTotal;
    if (phaseEl) phaseEl.textContent = done ? (forward ? 'упор: переключение завершено' : 'золотник в исходном положении') : names[modelled ? state.phase : 0];
    segments.forEach((segment, i) => segment.classList.toggle('now', modelled && state.phase === i + 1));
    if (cursorEl) cursorEl.style.left = `${(modelled ? Math.min(1, state.tMs / result.tTotal) : 0) * 100}%`;
    if (hud === 'scope') drawScope(state);
  };

  return { update };
};
