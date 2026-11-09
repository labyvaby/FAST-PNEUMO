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
}
