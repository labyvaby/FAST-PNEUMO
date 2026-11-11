// Каталог целиком: встроенные модели из valves.ts плюс добавленные через форму на сайте (хранятся в браузере).
import { VALVES, Valve } from './valves';

export const USER_CATALOG_KEY = 'pneumo-catalog';

export const loadUserValves = (): Valve[] => {
  try {
    const raw = localStorage.getItem(USER_CATALOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Valve[]) : [];
  } catch {
    return [];
  }
};

export const saveUserValves = (valves: Valve[]) => {
  try {
    localStorage.setItem(USER_CATALOG_KEY, JSON.stringify(valves));
  } catch {
    /* хранилище недоступно — данные останутся до перезагрузки */
  }
};

export const allValves = (): Valve[] => [...VALVES, ...loadUserValves()];

export const findValve = (id: string | null | undefined): Valve | undefined =>
  id ? allValves().find((valve) => valve.id === id) : undefined;

export const valveLabel = (valve: Valve) => `${valve.maker} ${valve.model}`;
