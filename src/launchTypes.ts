export enum Status {
  STARTED = 'Запущена',
  STOPPED = 'Остановлена',
}

export interface MeasurementData {
  time: string;
  elapsedSeconds: number;
  state: boolean;
  pressure: number;
  temperature: number;
  flow: number;
  position: number;
  targetPosition: number;
  velocity: number;
  energy: number;
  responseTimeMs: number | null;
}

import type { ValveParams } from './lib/valveModel';

/** С какой установкой сделан запуск — снимок на момент старта. */
export interface LaunchSetup {
  valveId: string | null;
  valveLabel: string;
  /** параметры модели подогнаны под даташит этого распределителя */
  calibrated: boolean;
  datasheetOnMs?: number;
  datasheetOffMs?: number;
  /** давление на регуляторе и на распределителе после линии, бар изб. */
  regulatorBar: number;
  valveBar: number;
  line: { lengthM: number; diameterMm: number; flowNlMin: number };
  params: ValveParams;
}

/** Одно переключение в серии: направление и время срабатывания. */
export interface ResponseSample {
  forward: boolean;
  ms: number;
}

export interface LaunchData {
  id: string;
  timestamp: string;
  endTimestamp: string;
  cycles: number;
  durationSeconds: number;
  samplesCount: number;
  pressure: number;
  temperature: number;
  flow: number;
  position: number;
  velocity: number;
  energy: number;
  averageResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  /** все переключения запуска; в старых записях может отсутствовать */
  responses?: ResponseSample[];
  forwardMeanMs?: number;
  reverseMeanMs?: number;
  setup?: LaunchSetup;
}
