import React, { createContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { LaunchData, Status } from './launchTypes';

// Журнал запусков хранится в браузере, чтобы отчёты не пропадали после перезагрузки страницы.
const STORAGE_KEY = 'pneumo-launches';

const loadLaunches = (): LaunchData[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LaunchData[]) : [];
  } catch {
    return [];
  }
};

interface LaunchContextProps {
  launches: LaunchData[];
  addLaunch: (launch: LaunchData) => void;
  clearLaunches: () => void;
  setCurrentStatus: (newStatus: Status | null) => void;
  status: Status | null;
}

export const LaunchContext = createContext<LaunchContextProps | undefined>(
  undefined
);

export const LaunchProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [launches, setLaunches] = useState<LaunchData[]>(loadLaunches);
  const [status, setStatus] = useState<Status | null>(Status.STOPPED);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(launches));
    } catch {
      /* хранилище недоступно — журнал останется до перезагрузки */
    }
  }, [launches]);

  const value = useMemo(
    () => ({
      launches,
      status,
      addLaunch: (launch: LaunchData) => setLaunches((prev) => [...prev, launch]),
      clearLaunches: () => setLaunches([]),
      setCurrentStatus: (newStatus: Status | null) => setStatus(newStatus),
    }),
    [launches, status]
  );

  return (
    <LaunchContext.Provider value={value}>{children}</LaunchContext.Provider>
  );
};
